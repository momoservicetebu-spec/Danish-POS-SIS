// JS/js_db.js - Database Lokal IndexedDB via Dexie.js (RENE POS Edition)
const db = new Dexie('EnterpriseRetailPOS_DB');

db.version(2).stores({
  products: 'barcode, sku_code, name',
  promotions: 'promo_id, target_barcode',
  members: 'member_id, card_code, phone, name',
  held_carts: 'hold_id, timestamp',
  transactions: 'trx_id, shift_id, sync_status',
  audit_logs: '++log_id, sync_status',
  app_state: 'key'
});

const LocalDB = {
  saveMasterData: async function(products, promotions, members) {
    await db.transaction('rw', db.products, db.promotions, db.members, async () => {
      await db.products.clear();
      await db.promotions.clear();
      if (products && products.length) await db.products.bulkPut(products);
      if (promotions && promotions.length) await db.promotions.bulkPut(promotions);
      if (members && members.length) {
        await db.members.clear();
        await db.members.bulkPut(members);
      }
    });
  },

  findByBarcode: async function(barcode) {
    return await db.products.get(String(barcode).trim());
  },

  searchProducts: async function(keyword) {
    const kw = keyword.toLowerCase();
    return await db.products
      .filter(p => p.name.toLowerCase().includes(kw) || p.barcode.includes(kw) || p.sku_code.toLowerCase().includes(kw))
      .limit(30)
      .toArray();
  },

  searchMembers: async function(keyword) {
    const kw = String(keyword || '').trim().toLowerCase();
    if (!kw) return await db.members.limit(20).toArray();
    return await db.members
      .filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.card_code.toLowerCase().includes(kw) ||
        m.phone.includes(kw)
      )
      .limit(20)
      .toArray();
  },

  upsertMember: async function(memberObj) {
    if (memberObj && memberObj.member_id) {
      await db.members.put(memberObj);
    }
  },

  getActivePromotions: async function() {
    const today = new Date().toISOString().slice(0, 10);
    return await db.promotions
      .filter(p => p.start_date <= today && p.end_date >= today)
      .toArray();
  },

  saveTransaction: async function(trx) {
    await db.transactions.put(trx);
  },

  getPendingTransactions: async function() {
    return await db.transactions.where('sync_status').equals('PENDING').toArray();
  },

  markTransactionsSynced: async function(trxIds) {
    await db.transactions.where('trx_id').anyOf(trxIds).modify({ sync_status: 'SYNCED' });
  }
};