# Observer persistence — prepared only

7 October 2026, 09:45 WIB. Existing `tekkteam-observer` PM2 PID78915 is healthy,
running as root with `/usr/bin/node` in `/var/www/tekkteam-releases/d2516bc`.
Actual worker DB says HEALTHY_OBSERVER_ONLY; the target receipt/binding is valid,
pending queue empty, and executionAllowed=false. Preserve this working service.

`deploy/tekkteam-observer.service` prepares an equivalent dedicated observer with
IP network access isolated and persistent application writes limited to
`/var/lib/tekkteam-observer`, with private temporary storage. It was not installed,
enabled or runtime-tested. No shared manager reload, global PM2
save/resurrect, production API change or VPS reboot was performed for this file.

Before any cutover, establish a TEKKTEAM-exclusive persistence method and prove
there cannot be a second supervisor resurrecting the old observer. The shared
PM2 dump and unrelated units are out of scope. Do not inspect or rewrite them.
The existing SQLite leader lease controls one leader but does not prove only one
process after an untested reboot. Reboot persistence therefore remains NOT VERIFIED.

Read the live product DB in place, including readable WAL/SHM sidecars. Do not use
SQLite immutable mode, a copied dataset, or individual-file bind mounts. Confirm
fresh heartbeat and actual observation in observer.sqlite; a process PID or
OBSERVER_ONLY stdout alone does not prove a successful tick.
