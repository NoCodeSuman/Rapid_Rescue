/**
 * STATIC REVIEW of backend/firebase/firestore.rules (text assertions). This is NOT a runtime rules test: it cannot
 * prove the rules behave correctly. Behavioural tests need the Firebase emulator (npm run test:rules).
 */
import { describe, expect, it } from 'vitest';
import rules from '../../../backend/firebase/firestore.rules?raw';

const stripComments = rules.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
const allowLines = stripComments.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('allow '));

describe('firestore.rules (static review)', () => {
  it('uses rules_version 2, one cloud.firestore service and ends with a catch-all deny', () => {
    expect(rules).toContain("rules_version = '2';");
    expect((rules.match(/service cloud\.firestore/g) ?? []).length).toBe(1);
    expect(stripComments).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}\s*\}\s*\}\s*$/);
  });
  it('has no unconditional or merely-authenticated allow rules', () => {
    for (const l of allowLines) {
      expect(l).not.toMatch(/if\s+true/);
      expect(l).not.toMatch(/if\s+request\.auth\s*!=\s*null\s*;/);
      expect(l).not.toMatch(/if\s+signedIn\(\)\s*;/);
    }
  });
  it('never lets a client create an admin profile, and admins can only change name, phone and status of a profile', () => {
    expect(rules).toContain("d.role in ['patient','driver']");
    expect(rules).toContain("affectedKeys().hasOnly(['displayName','phoneNumber','accountStatus','updatedAt'])");
    expect(rules).toContain('allow list: if isAdmin();');
  });
  it('lets a driver decline a request assigned to them, and only the assigned driver update an ambulance', () => {
    expect(rules).toMatch(/resource\.data\.status == 'assigned'\s*&& request\.resource\.data\.status == 'requested'/);
    expect(rules).toContain('get(/databases/$(database)/documents/drivers/$(resource.data.driverId)).data.userFirebaseUid == request.auth.uid');
  });
});
