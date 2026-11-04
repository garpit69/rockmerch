export const orderStatuses = [
  ['awaiting_payment', 'Menunggu pembayaran'],
  ['awaiting_confirmation', 'Menunggu konfirmasi'],
  ['confirmed', 'Terkonfirmasi'],
  ['packing', 'Sedang disiapkan'],
  ['shipped', 'Dikirim'],
  ['completed', 'Selesai'],
  ['cancelled', 'Dibatalkan'],
];

const allowedTransitions = {
  awaiting_payment: new Set(['awaiting_confirmation', 'confirmed', 'cancelled']),
  awaiting_confirmation: new Set(['confirmed', 'cancelled']),
  confirmed: new Set(['packing', 'cancelled']),
  packing: new Set(['shipped', 'cancelled']),
  shipped: new Set(['completed']),
  completed: new Set(),
  cancelled: new Set(),
};

export const getAllowedOrderStatuses = (currentStatus) => [
  currentStatus,
  ...(allowedTransitions[currentStatus] || []),
];
