-- Default konfigurasi sistem
INSERT INTO absen_konfigurasi (key, value, deskripsi) VALUES
  ('jam_masuk_awal', '04:00', 'Batas awal jendela scan masuk'),
  ('jam_masuk_akhir', '10:59', 'Batas akhir jendela scan masuk'),
  ('jam_pulang_mulai', '14:30', 'Batas awal jendela scan pulang'),
  ('lembur_ambang', '18:30', 'Jam pulang minimum untuk dianggap lembur'),
  ('lembur_mulai_hitung', '19:00', 'Jam mulai hitung durasi lembur'),
  ('lembur_maks_jam', '4', 'Maksimum jam lembur per hari'),
  ('lembur_pembulatan_menit', '15', 'Pembulatan lembur ke bawah (menit)'),
  ('anomali_persen_ambang', '50', 'Ambang deteksi anomali massal (% dari rata-rata)'),
  ('dedup_menit', '3', 'Jendela deduplikasi scan (menit)'),
  ('kuota_koreksi', '3', 'Maksimum koreksi per karyawan per bulan'),
  ('zona_waktu', 'Asia/Jayapura', 'Zona waktu lokasi proyek (Asia/Jakarta=WIB, Asia/Makassar=WITA, Asia/Jayapura=WIT)')
ON CONFLICT (key) DO NOTHING;
