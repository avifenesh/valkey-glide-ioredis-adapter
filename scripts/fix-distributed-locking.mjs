#!/usr/bin/env node
import { readFile, writeFile } from 'fs/promises';

async function fixFile() {
  let content = await readFile('tests/unit/distributed-locking.test.mjs', 'utf8');
  const original = content;
  
  // Fix remaining patterns
  content = content.replace(/return { success, reason: 'job_already_processing' };/g, "return { success: false, reason: 'job_already_processing' };");
  content = content.replace(/return { success, jobData };/g, "return { success: true, jobData };");
  content = content.replace(/return { success, job, workerId };/g, "return { success: true, job, workerId };");
  content = content.replace(/return { success, reason: 'no_jobs_available' };/g, "return { success: false, reason: 'no_jobs_available' };");
  content = content.replace(/return { success, clientId };/g, "return { success: true, clientId };");
  content = content.replace(/return { success, clientId, error: \(error\)\.message };/g, "return { success: false, clientId, error: error.message };");
  
  if (content !== original) {
    await writeFile('tests/unit/distributed-locking.test.mjs', content, 'utf8');
    console.log('✅ Fixed distributed-locking.test.mjs');
  }
}

fixFile().catch(console.error);