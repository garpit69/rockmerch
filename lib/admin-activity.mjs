export class AdminActivityWriteError extends Error {}

export const activityWriteFailureMessage =
  'Perubahan sudah diterapkan, tetapi riwayat aktivitas gagal dicatat. Muat ulang sebelum mencoba tindakan ini lagi.';

export const recordAdminActivity = async (sql, actor, action, details = '') => {
  try {
    await sql`
      INSERT INTO admin_activity(actor, action, details)
      VALUES (${actor}, ${action}, ${details})
    `;
  } catch (error) {
    console.error('Admin activity entry could not be recorded.', error);
    throw new AdminActivityWriteError('Admin activity entry could not be recorded.');
  }
};
