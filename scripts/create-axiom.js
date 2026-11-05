#!/usr/bin/env bun

import { main } from './create-axiom.ts';

main().catch((err) => {
  console.error('Failed to create project:', err);
  process.exit(1);
});
