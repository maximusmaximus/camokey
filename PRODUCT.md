# Product lock

Answers to the 20 yes/no questions, in order:

1. No. Login is not 24-word-only. 12-word or 24-word mnemonic, or a separate account passphrase.
2. Yes. No custodial recovery.
3. Yes. One login deterministically derives every serial, rebuildable offline.
4. Yes. Serial stays visible when the payload is private.
5. Yes. Names and labels are encrypted in the vault.
6. Yes. Public scan shows name and attached data with no extra code.
7. Yes. Private scan shows serial + locked until the item code.
8. Yes. Item passphrase is separate from the account login.
9. Yes. Item passphrase minimum is 16 characters and 3 character classes.
10. Yes. KDF is scrypt with production memory 64 MiB (Argon2id-equivalent cost). Tests use a reduced cost flag.
11. Yes. Only the original mnemonic holder can edit.
12. Yes. Owner lock rejects later edits until an explicit unlock.
13. No. A locked serial cannot be decrypted even with the item code.
14. Yes. The metadata board is append-only once published.
15. Yes. Public distribution is world-readable, not ciphertext.
16. Yes. Switching public to private re-encrypts and hides prior public text.
17. Yes. Batches are named groups of serials under one login.
18. Yes. A batch can mix public and private serials.
19. Yes. Export is an encrypted blob keyed by the login.
20. Yes. Demo storage stays local. No hosted account server.

Repo: https://github.com/maximusmaximus/camokey
