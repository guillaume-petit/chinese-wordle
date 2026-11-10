#!/usr/bin/env python3
"""
Enrichit curated-words.csv (niveaux TOCFL 4 à 6 par défaut) avec Claude Code
(`claude -p`), donc avec ton ABONNEMENT Claude (Pro/Max) et sans crédit API.

Pour chaque ligne reviewStatus=candidate dont `topic` est vide, génère :
  topic, exampleSimplified/Traditional/English, hintSimplified/Traditional/English

- Claude écrit : topic, exampleSimplified, exampleEnglish, hintSimplified, hintEnglish
  (sortie JSON validée par --json-schema).
- Le traditionnel est calculé localement (OpenCC s2twp + la colonne `traditional`
  pour le mot cible + normalisation 台灣/台北 + 3 corrections connues).
- Chaque résultat est validé (mot présent dans l'exemple, absent de l'indice,
  pas de lettres latines dans le chinois, topic = un mot minuscule). Les lignes
  refusées repartent chez Claude avec la liste des erreurs (3 tentatives).
- Reprise : relancer le script saute les lignes déjà remplies. Le CSV est réécrit
  (atomiquement, CRLF conservé) après chaque lot.
- Si la limite d'usage de l'abonnement est atteinte, le script s'arrête proprement :
  relance-le plus tard, il continue là où il s'était arrêté.

Prérequis (Ubuntu / WSL) :
    curl -fsSL https://claude.ai/install.sh | bash       # installe Claude Code
    claude                                               # se connecter une fois (compte Pro/Max)
    python3 -m venv ~/venvs/tocfl
    ~/venvs/tocfl/bin/pip install opencc-python-reimplemented

Utilisation (ne PAS définir ANTHROPIC_API_KEY, sinon Claude Code facturerait l'API) :
    ~/venvs/tocfl/bin/python fill_tocfl_cli.py --input curated-words.csv --output test.csv --levels 4 --limit 50
    ~/venvs/tocfl/bin/python fill_tocfl_cli.py --input curated-words.csv --output curated-words.csv
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

FILL_COLUMNS = [
    "topic",
    "exampleSimplified", "exampleTraditional", "exampleEnglish",
    "hintSimplified", "hintTraditional", "hintEnglish",
]


class UsageLimit(Exception):
    """Limite d'usage de l'abonnement atteinte : on s'arrête proprement."""


# ---------------------------------------------------------------- traditionnel

_NORM = [("臺灣", "台灣"), ("臺北", "台北"), ("臺中", "台中"), ("舞臺", "舞台")]
# Erreurs connues d'OpenCC s2twp (contexte ambigu) corrigées après coup.
_FIX = [("髮癢", "發癢"), ("復雜", "複雜"), ("瞭解", "了解")]


def _post(text: str) -> str:
    for a, b in _NORM + _FIX:
        text = text.replace(a, b)
    return text


def make_converter():
    from opencc import OpenCC

    cc = OpenCC("s2twp")

    def to_trad(text: str, simp: str, trad: str) -> str:
        if simp and simp in text:
            return _post(trad.join(cc.convert(p) for p in text.split(simp)))
        return _post(cc.convert(text))

    return to_trad


# ------------------------------------------------------------------ validation

_LATIN = re.compile(r"[A-Za-z]")
_TOPIC = re.compile(r"^[a-z]{3,20}$")


def validate(item: dict, row: dict) -> list[str]:
    errs = []
    simp = row["simplified"]
    ex, hint = item.get("exampleSimplified", ""), item.get("hintSimplified", "")
    topic = item.get("topic", "")
    if not _TOPIC.match(topic):
        errs.append(f"topic invalide ({topic!r}) : un seul mot anglais en minuscules")
    if simp not in ex:
        errs.append(f"exampleSimplified doit contenir exactement « {simp} »")
    if simp in hint:
        errs.append(f"hintSimplified ne doit PAS contenir « {simp} »")
    if _LATIN.search(ex) or _LATIN.search(hint):
        errs.append("pas de lettres latines dans les phrases chinoises")
    for k in ("exampleSimplified", "exampleEnglish", "hintSimplified", "hintEnglish"):
        if not str(item.get(k, "")).strip():
            errs.append(f"{k} vide")
    if len(ex) > 60:
        errs.append("exampleSimplified trop long (une phrase simple, ≤ 40 caractères environ)")
    return errs


# ---------------------------------------------------------------------- prompt

SYSTEM_PROMPT = """\
Tu aides à construire un jeu de vocabulaire chinois (apprenants francophones, \
chinois de Taïwan, niveaux TOCFL). Tu n'as accès à aucun outil et tu n'en as pas \
besoin : tu réponds uniquement avec le JSON demandé. Pour chaque mot reçu, tu produis :

- topic : UN seul mot anglais en minuscules classant le mot. Réutilise en priorité \
les topics existants listés plus bas ; n'en crée un nouveau que si aucun ne convient \
vraiment (reste générique : pas de topic utilisé par un seul mot).
- exampleSimplified : UNE phrase d'exemple simple, naturelle, qui contient EXACTEMENT \
le mot cible (même suite de caractères), idéalement 8 à 25 caractères, adaptée au \
niveau TOCFL du mot. Le mot doit y être employé dans son sens courant à Taïwan.
- exampleEnglish : traduction anglaise naturelle de cette phrase.
- hintSimplified : UNE phrase simple qui permet de DEVINER le mot sans trop en dire : \
définition, situation ou association typique. Elle ne doit JAMAIS contenir le mot \
cible (ni la suite de caractères exacte), ni son pinyin, ni de lettres latines. \
Pas de synonyme évident qui rende la réponse triviale.
- hintEnglish : traduction anglaise de l'indice (sans dire le mot anglais équivalent \
quand c'est évitable).

Règles importantes :
- La `gloss` vient de CC-CEDICT et est parfois fausse ou décalée (sens rare, argot, \
mot de classe « CL: »). Appuie-toi sur le sens courant du mot en chinois standard de \
Taïwan, tel qu'enseigné au niveau TOCFL indiqué.
- Écris UNIQUEMENT en chinois simplifié dans les champs *Simplified* (le traditionnel \
est converti automatiquement) ; pas de pinyin, pas de lettres latines dans le chinois.
- Contenu neutre, adapté à tous publics (pas de politique, sexe, violence gratuite).
- Pour les mots grammaticaux (adverbes, conjonctions, particules) : l'indice décrit \
la fonction (« sert à relier deux idées opposées »...).
- Pour les noms propres/lieux : l'indice donne des repères (géographie, culture) sans \
citer le nom.
- Rends exactement une entrée par id reçu, avec le même id.
"""

SCHEMA = {
    "type": "object",
    "properties": {
        "entries": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "topic": {"type": "string"},
                    "exampleSimplified": {"type": "string"},
                    "exampleEnglish": {"type": "string"},
                    "hintSimplified": {"type": "string"},
                    "hintEnglish": {"type": "string"},
                },
                "required": ["id", "topic", "exampleSimplified", "exampleEnglish",
                             "hintSimplified", "hintEnglish"],
            },
        }
    },
    "required": ["entries"],
}

_LIMIT_RE = re.compile(r"usage limit|limit reached|rate limit|quota|too many requests|"
                       r"limit will reset|out of (extra )?usage", re.I)


def build_system(topics: list[str]) -> str:
    return SYSTEM_PROMPT + "\nTopics existants : " + ", ".join(sorted(topics)) + "\n"


def build_words_json(rows: list[dict], feedback: dict[str, list[str]]) -> str:
    words = []
    for r in rows:
        w = {
            "id": r["id"],
            "simplified": r["simplified"],
            "pinyin": r["pinyinDisplay"],
            "tocflLevel": r["tocflLevel"],
            "gloss": (r["gloss"] or "")[:120],
        }
        if r["id"] in feedback:
            w["previousAttemptErrors"] = feedback[r["id"]]
        words.append(w)
    return json.dumps(words, ensure_ascii=False, indent=1)


# --------------------------------------------------------------- appel à claude

def run_claude(cmd: list[str], stdin: str, cwd: str, timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, input=stdin, capture_output=True, text=True,
                          encoding="utf-8", cwd=cwd, timeout=timeout)


def call_model(args, system: str, rows: list[dict], feedback: dict[str, list[str]],
               workdir: str) -> dict[str, dict]:
    base = [
        args.claude_bin, "-p",
        "Complète les mots du JSON reçu sur l'entrée standard : renvoie une entrée par id.",
        "--output-format", "json",
        "--json-schema", json.dumps(SCHEMA),
        "--system-prompt", system,
        "--tools", "",
        "--no-session-persistence",
    ]
    if args.model:
        base += ["--model", args.model]
    cmd = base + ([] if args.no_safe_mode else ["--safe-mode"])
    stdin = build_words_json(rows, feedback)

    proc = run_claude(cmd, stdin, workdir, args.timeout)
    if proc.returncode != 0 and "--safe-mode" in cmd and re.search(
            r"unknown (option|argument)|unrecognized", proc.stderr + proc.stdout, re.I):
        # Version de Claude Code trop ancienne pour --safe-mode : on réessaie sans.
        cmd.remove("--safe-mode")
        proc = run_claude(cmd, stdin, workdir, args.timeout)

    text = (proc.stdout or "").strip()
    payload = None
    if text:
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = None

    problem = ""
    if payload is None:
        problem = (proc.stderr or text or "sortie vide")[:400]
    elif payload.get("is_error") or proc.returncode != 0:
        problem = str(payload.get("result") or proc.stderr or "erreur")[:400]
    if problem:
        if _LIMIT_RE.search(problem + proc.stderr):
            raise UsageLimit(problem)
        raise RuntimeError(problem)

    data = payload.get("structured_output")
    if data is None:  # repli : le JSON est peut-être dans `result`
        res = payload.get("result", "")
        m = re.search(r"\{.*\}", res, re.S)
        data = json.loads(m.group(0)) if m else {}
    entries = data.get("entries", []) if isinstance(data, dict) else []
    return {e.get("id"): e for e in entries if isinstance(e, dict)}


# ------------------------------------------------------------------------- CSV

def read_csv(path: Path) -> tuple[list[str], list[dict]]:
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader.fieldnames), list(reader)


def write_csv_atomic(path: Path, header: list[str], rows: list[dict]) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=header, lineterminator="\r\n")
            w.writeheader()
            w.writerows(rows)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ------------------------------------------------------------------------ main

def process_batch(args, system, batch, to_trad, workdir, stop: threading.Event):
    """Renvoie (résultats validés {id: champs}, ids abandonnés)."""
    done: dict[str, dict] = {}
    pending = list(batch)
    feedback: dict[str, list[str]] = {}
    for attempt in range(1, args.max_attempts + 1):
        if not pending or stop.is_set():
            break
        try:
            got = call_model(args, system, pending, feedback, workdir)
        except UsageLimit as exc:
            print(f"\n! Limite d'usage atteinte : {exc}", file=sys.stderr)
            stop.set()
            break
        except Exception as exc:
            print(f"  ! erreur (tentative {attempt}) : {exc}", file=sys.stderr)
            time.sleep(5 * attempt)
            continue
        still = []
        for row in pending:
            item = got.get(row["id"])
            if not item:
                feedback[row["id"]] = ["entrée absente de la réponse"]
                still.append(row)
                continue
            errs = validate(item, row)
            if errs:
                feedback[row["id"]] = errs
                still.append(row)
                continue
            simp, trad = row["simplified"], row["traditional"]
            done[row["id"]] = {
                "topic": item["topic"].strip(),
                "exampleSimplified": item["exampleSimplified"].strip(),
                "exampleTraditional": to_trad(item["exampleSimplified"].strip(), simp, trad),
                "exampleEnglish": item["exampleEnglish"].strip(),
                "hintSimplified": item["hintSimplified"].strip(),
                "hintTraditional": to_trad(item["hintSimplified"].strip(), simp, trad),
                "hintEnglish": item["hintEnglish"].strip(),
            }
        pending = still
    return done, [r["id"] for r in pending]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", default="curated-words.csv")
    ap.add_argument("--output", default="curated-words.csv",
                    help="peut être identique à --input (reprise automatique)")
    ap.add_argument("--levels", default="4,5,6", help="niveaux TOCFL, ex. 4,5,6")
    ap.add_argument("--batch-size", type=int, default=25)
    ap.add_argument("--workers", type=int, default=1,
                    help="appels en parallèle (1 recommandé avec un abonnement Pro)")
    ap.add_argument("--model", default="sonnet", help="alias (sonnet, opus, haiku…) ou nom complet")
    ap.add_argument("--max-attempts", type=int, default=3)
    ap.add_argument("--limit", type=int, default=0, help="ne traiter que N lignes (essai)")
    ap.add_argument("--timeout", type=int, default=600, help="secondes max par appel claude")
    ap.add_argument("--claude-bin", default="claude")
    ap.add_argument("--no-safe-mode", action="store_true",
                    help="ne pas passer --safe-mode (si ta version de Claude Code ne le connaît pas)")
    args = ap.parse_args()

    if shutil.which(args.claude_bin) is None:
        print("Commande `claude` introuvable : installe Claude Code puis connecte-toi "
              "(`claude`).", file=sys.stderr)
        return 2
    if os.environ.get("ANTHROPIC_API_KEY"):
        print("Attention : ANTHROPIC_API_KEY est défini, Claude Code risque d'utiliser "
              "l'API (facturée) au lieu de ton abonnement. `unset ANTHROPIC_API_KEY` "
              "pour utiliser l'abonnement.", file=sys.stderr)

    src = Path(args.input)
    out = Path(args.output)
    header, rows = read_csv(out if out.exists() else src)
    for col in FILL_COLUMNS:
        if col not in header:
            print(f"Colonne manquante : {col}", file=sys.stderr)
            return 2

    levels = {s.strip() for s in args.levels.split(",")}
    todo = [r for r in rows
            if r["reviewStatus"] == "candidate" and r["tocflLevel"] in levels and not r["topic"]]
    if args.limit:
        todo = todo[: args.limit]
    topics = sorted({r["topic"] for r in rows if r["topic"]})
    print(f"{len(todo)} lignes à traiter (niveaux {sorted(levels)}), "
          f"{len(topics)} topics existants.")
    if not todo:
        return 0

    system = build_system(topics)
    to_trad = make_converter()
    by_id = {r["id"]: r for r in rows}
    batches = [todo[i:i + args.batch_size] for i in range(0, len(todo), args.batch_size)]

    lock = threading.Lock()
    stop = threading.Event()
    failed: list[str] = []
    n_done = 0
    # Répertoire de travail vide : Claude Code n'y trouve ni CLAUDE.md ni config de projet.
    with tempfile.TemporaryDirectory(prefix="tocfl_claude_") as workdir:
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(process_batch, args, system, b, to_trad, workdir, stop): b
                       for b in batches}
            for fut in as_completed(futures):
                done, bad = fut.result()
                with lock:
                    for rid, fields in done.items():
                        by_id[rid].update(fields)
                    failed.extend(bad)
                    n_done += len(done)
                    write_csv_atomic(out, header, rows)
                    print(f"  {n_done}/{len(todo)} écrites ({len(failed)} non remplies)")

    remaining = sum(1 for r in todo if not r["topic"])
    if stop.is_set():
        print(f"\nArrêt sur limite d'usage : {n_done} lignes écrites, {remaining} restantes. "
              f"Relance le même programme plus tard pour continuer.")
        return 3
    if failed:
        print("\nLignes non remplies (relancer le script pour réessayer) :")
        for rid in failed:
            print(f"  {rid}  {by_id[rid]['simplified']}")
    print(f"\nTerminé : {n_done} lignes complétées → {out}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
