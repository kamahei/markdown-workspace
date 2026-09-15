import { MemorySource } from '@core/fs/memory-source';
import { CONFORMANCE_TREE, runFileSourceConformance } from './fs-conformance';

// The reference implementation. If the suite cannot pass here, the suite is
// wrong rather than the implementations.
runFileSourceConformance('MemorySource', {
  create: () => new MemorySource('memory', CONFORMANCE_TREE, '/'),
  root: '/',
  expected: { kind: 'snapshot', canPersist: false, canRefresh: false },
});
