import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { configure } from '@testing-library/react'

// Whole-app tests wait on IndexedDB and a full render; the 1 s default flakes when every test file runs in parallel.
configure({ asyncUtilTimeout: 3000 })
