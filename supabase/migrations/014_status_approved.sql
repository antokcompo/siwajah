-- Add 'approved' status to absen_gaji_bulanan
ALTER TABLE absen_gaji_bulanan DROP CONSTRAINT IF EXISTS absen_gaji_bulanan_status_check;
ALTER TABLE absen_gaji_bulanan ADD CONSTRAINT absen_gaji_bulanan_status_check
  CHECK (status IN ('draft', 'approved', 'final'));
