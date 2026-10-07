# CamoKey product lock

Answers to the 20 yes/no questions, in the order asked.

1. One mnemonic owns many batches as separate logins? **No.** One mnemonic is one camo set. Named serial lists still exist inside that set.
2. Serials deterministic from mnemonic + name + index? **Yes.** Rebuildable offline.
3. Public scan shows name and metadata to anyone? **Yes.**
4. Private scan identifies the item but hides metadata until a code? **Yes.**
5. Item unlock code separate from the mnemonic? **Yes.**
6. Item passphrase at least 16 characters and 3 character classes? **Yes.**
7. Metadata encrypted on the client? **Yes.** The store holds ciphertext.
8. Only the generating mnemonic can edit or lock? **Yes.**
9. Lock freezes edits, including the owner's, until unlock? **Yes.**
10. Metadata is a thread? **Yes.**
11. Public thread encrypted at rest, opened with a key published on the record? **Yes.**
12. Each serial has its own visibility? **Yes.**
13. Only public and private? **No.** Also unlisted: omitted from the public index, readable with the link token.
14. Owner can rotate the item passphrase without a new camo? **Yes.**
15. Login is mnemonic-only? **Yes.** 12 or 24 words. No email account.
16. BIP39 English wordlist? **Yes.**
17. Memory-hard KDF? **Yes.** scrypt, about 64 MiB in production. Tests use cost=test.
18. Public index is serial, name, and batch, never private ciphertext? **Yes.**
19. Camo to serial is offline; only metadata lookup needs the store? **Yes.**
20. Lost mnemonic is unrecoverable? **Yes.** No admin reset.

A lost mnemonic loses owner rights. The item passphrase cannot edit, lock, or unlock.
