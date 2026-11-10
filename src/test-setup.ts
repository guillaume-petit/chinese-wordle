import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { decodeDictionary, installDictionary, type CompactDictionary } from './dictionary'
import runtime from './generated/dictionary.runtime.json?raw'
import { installCurated, type CuratedContent } from './data'
import curated from './generated/curated.json?raw'

// The app fetches these assets at startup; tests install the same generated data synchronously.
installDictionary(decodeDictionary(JSON.parse(runtime) as CompactDictionary))
installCurated(JSON.parse(curated) as CuratedContent)

afterEach(() => cleanup())
