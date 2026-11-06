# Integrasi PocketBase Jadwalin

Adapter aplikasi memakai koleksi `users`, `mata_kuliah`, dan `jadwal`.
UI, validasi form, ID angka untuk notifikasi, dan alur kode email enam digit
dipertahankan. ID record PocketBase disimpan terpisah sebagai `remoteId`.

## Persiapan server

Hook dan migration `1793836800_jadwalin_app_contract.js` berada di
`server/pb_hooks` dan `server/pb_migrations`.
Mulai ulang PocketBase agar migration dan hook dimuat. Konfigurasikan SMTP
serta alamat pengirim pada dashboard PocketBase untuk pengiriman email nyata.

Migration menambah `jam_selesai`, `pengingat_aktif`, dan koleksi internal
`jadwalin_email_challenges` yang seluruh API rules-nya terkunci. Jadwal lama
yang belum memiliki jam selesai perlu dilengkapi di dashboard; migration
tidak mengarang durasi kuliah yang sebelumnya tidak disimpan.

Endpoint `/api/jadwalin/schedules` menyimpan/mengubah/menghapus mata kuliah
dan jadwal dalam satu transaksi. Validasi bentrok juga berlaku pada API
koleksi `jadwal`; batas waktu yang sama ditolak dan jeda satu menit diterima.

Endpoint `/api/jadwalin/auth/*` mendukung kode sekali pakai yang berlaku lima
menit, jeda kirim ulang 60 detik, maksimal lima percobaan, dan grant reset
password sekali pakai. Hash kode dan grant disimpan hanya di koleksi internal.
Ini diperlukan karena alur verifikasi/reset bawaan PocketBase memakai tautan,
sedangkan UI Jadwalin memakai kode enam digit.

## Menjalankan aplikasi web

Dari direktori `mobile`:

```powershell
flutter run -d chrome --dart-define=POCKETBASE_URL=http://127.0.0.1:8090
```

Sesi PocketBase dipulihkan pada bootstrap. Gangguan jaringan tidak menghapus
sesi; penolakan sesi oleh server mengembalikan pengguna ke login.
Cache jadwal repository masih berada di memori seperti adapter sebelumnya;
antrean perubahan offline dan sinkronisasi lintas perangkat belum ditambahkan.

## Pengujian

Dari direktori `mobile`:

```powershell
flutter test
.\tool\test_pocketbase_integration.ps1
```

Skrip integrasi membuat server/database sementara, menjalankan migration asli
ditambah migration baru, dan membersihkannya sesudah pengujian. Email ditangkap
oleh fixture khusus dalam direktori sementara sehingga tidak dikirim ke
alamat sungguhan. Fixture tidak termasuk hook yang dipasang ke server.
Skrip CRUD/rules sebelumnya juga dijalankan di server sementara dengan field
jam selesai yang sekarang wajib.

Pengujian ini tidak membuktikan pengiriman SMTP nyata atau perilaku
notifikasi/latar belakang Android.
