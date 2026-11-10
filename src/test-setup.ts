import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { decodeDictionary, installDictionary, type CompactDictionary } from './dictionary'
import runtime from './generated/dictionary.runtime.json?raw'

// The app fetches this asset at startup; tests install the same generated data synchronously.
installDictionary(decodeDictionary(JSON.parse(runtime) as CompactDictionary))

afterEach(() => cleanup())
