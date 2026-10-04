# PROJECT_PLAYBOOK — TEKKTEAM

Latest priority4October2026: persistent engineering manager through M10. Current
M4 debit blocker must be proven, not bypassed. Commit/push verified checkpoints;
maintain CLOUD_HANDOFF. Continue safe independent work while a branch is gated.
Wallet transaction signature, Mainnet broadcast, real spend, destructive production,
secret and security actions require explicit human gates. Manual wallet approval.
After confirmed M4 continue M5; later real execution needs separate approval.
This supersedes historical stop-after-M4 instructions. No fabricated receipts.

Aturan tetap proyek. Baca saat mulai sesi atau saat isinya berubah; tidak perlu dibaca ulang setiap edit.

Latest M3.1 mandate4October2026: an explicitly enforced fresh application execution
review may qualify M3 under EXECUTION_GUARDED. Never describe that as HARD_ENFORCED
or an absolute Pump on-chain cap. Total ceiling0.01SOL includes all debit components;
Mainnet reserve0.001SOL is preserved. Historical/expired review is not authorization.
M4/signing/broadcast remain separately gated and are not started by completing M3.1.

**Repo:** `C:\Users\budir\Music\tekkteam`.
**Tujuan:** connect wallet Solana → launch coin Pump.fun + agent → agent trading mint coin terkait. Agent GENERAL lama tetap tersedia. Target produk ini berbeda dari izin menjalankan transaksi nyata.

## Tiga file, tiga fungsi

| File | Isi | Kapan diperbarui |
| --- | --- | --- |
| PROJECT_PLAYBOOK.md | Arah produk, batas, aturan kerja | Keputusan produk/teknis berubah |
| PROJECT_STATUS.md | Bukti terbaru, milestone, blocker | Akhir batch atau blocker baru |
| EXECUTION_BRIEF.md | Satu milestone aktif, scope, acceptance, deadline | Saat memilih milestone berikutnya |

Tiga file ini menggantikan master prompt lama sebagai pengarah pekerjaan. Dokumen teknis lama tetap menjadi referensi; jangan menghapusnya atau membuat backlog tandingan. AGENTS.md tetap dipakai untuk petunjuk repo. Sinkronkan hanya penunjuk/prioritas yang relevan jika bertentangan dengan instruksi pengguna terbaru; jangan menulis ulang semua dokumentasi atau menyiasati permission.

## Produk dan arah desain terbaru

- Arah terbaru: Connect Wallet → Sign In → isi coin + agent → review biaya →
  Launch Coin → coin + agent terkait → Fund Agent → Start Trading/Pause.
  Label mengikuti aksi nyata: Save Draft tidak boleh disebut Launch Coin.
- Alur pengguna memakai bahasa Inggris singkat, tanpa fixture/harness/controller
  atau jargon delivery. Status runtime tes dicatat di tooling/status; arahan visual
  terbaru menghapus banner Test Mode global tanpa mengubah pembatasan internal.
  Connect/login/launch/funding/trading memerlukan otorisasi masing-masing.
- Urutan milestone A UI+login, B draft+integrasi launch, C launch+association
  terverifikasi, D funding+trading terkait, E verifikasi end-to-end. Pisahkan status
  UI, backend, browser, launch nyata, trading nyata. Source/test lokal bukan Live.

- Arahan langsung3Oktober2026 menggantikan preservation visual lama: ikuti layout, hierarki, navigasi, komponen, spacing dan interaksi https://bagworkagent.fun/#/ sedekat mungkin, dengan brand/aset TEKKTEAM. Observasi UI bukan bukti backend atau izin menyalin ekonomi Bagwork. GENERAL dan Payroll tetap tersedia.
- Koreksi langsung3Oktober2026 11:02: lima sidebar utama Home, Launchpad, Agents, Tokens, Wallet. Ikuti struktur/layout/interaksi Bagwork dengan palet biru tua+kuning, font dan komponen asli TEKKTEAM. Destinasi lain termasuk GENERAL/Payroll tetap tersedia melalui halaman terkait/footer; bukan sidebar utama.
- Wallet Solana memakai satu state Connect/Sign In/balance: shortcut Phantom,
  Solflare, Backpack, MetaMask Solana, Trust Wallet, Jupiter Mobile, Espresso Cash;
  discovery dinamis Wallet Standard dan transport resmi sesuai platform. Reown
  internals tetap tersedia; tidak ada launcher katalog di modal. Selector awal hanya Phantom/Solflare/Backpack; Load More membuka empat shortcut lain dan Show Less. Logo lokal stabil; status ketersediaan terpisah, bukan daftar dukungan palsu.
  Setiap wallet perlu bukti perangkat nyata atau blocker teknis yang spesifik.
  EVM tidak diterima. SDK transport bukan izin transaksi atau login otomatis.
- Connect, autentikasi owner, approval transaksi, dan izin trading adalah status berbeda. Tidak boleh saling membuka izin otomatis.
- UI membaca kontrak API aktual; data disimpan di backend. Pertahankan arsitektur/modul yang valid. Fixture harus diberi label; data unavailable bukan nol, Save draft bukan launch.
- Scope Launchpad berasal dari server. Agent identity-only dengan coin/mint null tetap valid; setelah launch terverifikasi, operasi associated-coin terikat pada mint terverifikasi. GENERAL lama yang valid tetap bekerja. Receipt tidak boleh dibuat dari asumsi association.

## Cara bekerja cepat

1. Baca STATUS dan BRIEF, cek singkat cwd/diff/source yang relevan, lalu eksekusi. Batas orientasi awal 5 menit. Jangan audit seluruh repo untuk revisi kecil.
2. Satu milestone aktif, satu penulis file bersama. Reviewer atau task paralel hanya jika manfaat/dependensinya jelas. Jangan menjalankan banyak build berat bersamaan.
3. Gunakan komponen dan tes yang ada. Perbaiki akar masalah dengan perubahan terbatas. Ikuti redesign referensi yang diotorisasi; hindari refactor luas, dependency baru, dan perubahan kosmetik di luar brief.
4. Verifikasi sesuai dampak: UI dengan browser desktop/mobile; API dengan integrasi dan kasus gagal relevan; auth/transaksi dengan pengujian batas otorisasi. Jalankan build bila source/build terdampak atau gate repo mewajibkan. Jangan mengulang suite luas tanpa alasan teknis.
5. Berhenti memoles ketika acceptance milestone tercapai. Temuan di luar scope masuk backlog kecuali langsung memblokir milestone atau merupakan cacat kritis pada jalur yang disentuh.

## Target waktu

| Jenis perubahan | Target batch |
| --- | --- |
| Copy, ikon, spacing, satu bug UI sempit | 5–10 menit |
| Perilaku satu komponen/API yang jelas | 15–25 menit |
| Integrasi owner/launch/backend yang kompleks | 30 menit per bagian |

Ini target kerja, bukan janji selesai atau alasan melewati tes penting. Catat waktu mulai WIB dan deadline absolut saat eksekusi benar-benar dimulai. Pada deadline, akhiri di checkpoint aman: DONE, PARTIAL, atau BLOCKED beserta bukti. Jangan memperpanjang diam-diam, mengganti deadline untuk menyembunyikan keterlambatan, atau mengklaim selesai dari kode yang belum diuji.

Jika PARTIAL, catat perubahan teruji dan pekerjaan tersisa. Satu batch lanjutan maksimal 15 menit boleh dipilih jika langkah penyelesaiannya konkret; laporkan sebelum mulai. Jika belum ada jalur jelas, parkir milestone dan lanjut task independen yang sudah tercakup roadmap. Jangan mengulang percobaan yang sama tanpa informasi baru.

## Bukti dan kelanjutan

- Laporan singkat: hasil yang bisa dipakai/dilihat, file utama berubah, verifikasi, blocker, langkah berikutnya. Jumlah tes bukan ukuran progres tunggal. Beri update saat hasil penting atau kendala muncul; jangan diam satu jam tanpa penjelasan.
- Pertahankan satu preview utama dan pastikan source frontend/backend sesuai. Jangan mematikan preview sehat atau worker/proses lain tanpa identifikasi.
- Setelah DONE, perbarui STATUS singkat, isi BRIEF untuk milestone siap berikutnya, lalu lanjut otomatis. Jika approval tertentu tertahan, lanjut kode/tes independen yang diizinkan.
- Jangan mengulang pekerjaan yang sudah terbukti. Tidak perlu prompt baru untuk task dalam roadmap. Jika semua task siap terblokir, sampaikan tindakan pengguna minimum, simpan checkpoint, dan nyatakan tidak ada eksekusi aktif.

## Batas tetap

4October2026 productionization mandate: engineering authority comes from durable
state and verified receipts, with explicit lifecycle/failure states, deterministic
execution identity, idempotent one-shot submit, same-signature reconciliation for
UNKNOWN outcomes, restart-safe worker state and verified accounting. No fake/demo
state may be presented as real. Reuse SQLite while its proven concurrency boundary
is sufficient; no cosmetic database migration or second conflicting authority.
Keep secrets/session/custody material server-side and preserve Mainnet/Risk gates.

Milestones are gated: M3 real-owner public metadata + unsigned create_v2 simulation
and honest maximum/estimated debit distinction; M4 exactly one human-approved launch
with confirmed receipt then STOP; M5 honest post-launch state; M6 exactly one separately
authorized funding/BUY/SELL/accounting round trip then STOP; M7 repetitive execution
only after M6 and explicit complete risk limits/global kill switch. Missing critical
limits deny start. These are requirements, not automatic financial authorization.
Current priority is M3 only. M3 PASS permits M4 preparation for review, no broadcast.
Preserve TEKKTEAM UI; do not inspect/copy CUDA. Other wallets are secondary QA after
the primary Phantom product path. Historical receipt associations remain UNRESOLVED
without exact provenance, never inferred from name/ticker/time/wallet similarity.

Live OFF. Tidak ada signing wallet/agent, broadcast mainnet, funding, withdrawal, publikasi metadata, atau deploy produksi tanpa izin eksplisit terpisah. Gunakan hanya akses RPC yang memang telah diizinkan. Implementasi kode, fixture disposable, debugging, dan pengujian lokal tidak perlu persetujuan ulang. Jangan melonggarkan auth/validator, mengubah custody, mengarang receipt, menghapus data, atau menimpa perubahan pengguna. Mock tidak membuktikan wallet extension atau transaksi nyata.

## Home hero composition — 3 October2026

Latest H2 correction: center the existing map at about70% of its prior desktop
size, with all hero copy and CTA underneath in normal flow. H3 refines desktop
copy alignment. Latest H4: headline and two CTA at the left content edge, eyebrow
and subtitle at the right edge below the map; mobile remains stacked/centered. Lower sections/footer
share a centered shell within the usable area after the sidebar. Larger readable sidebar,
unboxed logo, existing mobile drawer. No global yellow Test Mode banner. Retain
TEKKTEAM blue/yellow/fonts, existing sections and functionality. Banner removal is
presentation only: isolated runtime, internal safety and capability limits remain.

3October2026 read-only balance authorization: preserve successful owner auth and
allow only authenticated Mainnet genesis/getBalance reads using canonical configured
RPC. This does not authorize transaction signing, broadcast, launch, funding,
transfers, trading, publication or deployment. Real browser evidence stays distinct
from fixture UI and direct RPC diagnostics.

3October2026 dedicated Reown: client configuration uses VITE_REOWN_PROJECT_ID in
ignored .env.local, never a source literal. More Wallets uses Solana-only AppKit
discovery through the shared wallet state; direct Phantom remains independent.
Isolated preview imports only this named public key and narrow Reown network
allowlist. No automatic auth or transaction permissions; real-device evidence
remains required separately from visible wallet buttons and fixture tests.

3October2026 M2B exception: user authorizes a separate mobile HTTPS staging/test
deployment, specifically isolated Hostinger Ubuntu VPS staging after read-only
preflight/report. Preserve /var/www/tekkteam and PM2 tekkteam-api/tekkteam-launch;
never restart/reconfigure those for staging. Separate persistent auth data, exact
HTTPS origin and Secure cookies required. Stop for human device verification;
no M3 or money capabilities. Production deploy prohibition remains unchanged.

3October2026 latest M2 correction: a fresh user-initiated Connect continues once
to the existing owner message authentication; the wallet owner still explicitly
approves that message. Reuse a valid same-wallet server session, never infer auth
from a public key. Auth cancellation retains connection and offers manual Sign In
retry without a popup loop. No transaction permission follows from authentication.
Curated Load More/Show Less remains the only selector expansion; Reown internals stay.



M4 exact user mandate4October2026: authorize only one owner-approved Mainnet create_v2 for the pinned owner/aaaaada/ret-3ED revision1, initial buy0 and0.01SOL review ceiling. Fresh guarded review required; one durable broadcast latch; authoritative receipt only. Production/funding/trading/withdrawal/transfers remain OFF. STOP after confirmed launch; no next milestone.
