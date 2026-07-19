const { v4: uuid } = require('uuid');
const { getDb } = require('../db');

function store() {
  const db = getDb();
  const data = db._data();
  if (!data.checklist_templates) data.checklist_templates = [];
  return { db, data };
}

function persist(db) {
  if (typeof db._replace === 'function') {
    db._replace(db._data());
  }
}

const DEFAULT_FIELDS = [
  { key: 'powers_on', label: 'Powers on', type: 'boolean', required: true },
  { key: 'screen_ok', label: 'Screen acceptable', type: 'boolean', required: true },
  { key: 'account_unlocked', label: 'iCloud / FRP unlocked', type: 'boolean', required: true },
  { key: 'model_matches', label: 'Model matches quote', type: 'boolean', required: true },
  { key: 'storage_matches', label: 'Storage matches', type: 'boolean', required: false },
  { key: 'condition_grade', label: 'Condition grade', type: 'select', options: ['Excellent', 'Good', 'Fair', 'Poor'], required: true },
  { key: 'notes', label: 'Driver notes', type: 'text', required: false },
];

function ensureDefault(partnerId) {
  const { db, data } = store();
  let list = data.checklist_templates.filter((c) => c.partner_id === partnerId);
  if (!list.length) {
    const tpl = {
      id: uuid(),
      partner_id: partnerId,
      name: 'Default door grading',
      description: 'Partner-owned checklist — PurCheaper does not grade devices for you.',
      is_default: true,
      fields: DEFAULT_FIELDS,
      created_at: new Date().toISOString(),
    };
    data.checklist_templates.push(tpl);
    persist(db);
    list = [tpl];
  }
  return list;
}

function listTemplates(partnerId) {
  return ensureDefault(partnerId);
}

function getTemplate(partnerId, id) {
  const list = ensureDefault(partnerId);
  return list.find((c) => c.id === id) || null;
}

function createTemplate(partnerId, body) {
  const { db, data } = store();
  const tpl = {
    id: uuid(),
    partner_id: partnerId,
    name: body.name || 'Custom checklist',
    description: body.description || '',
    is_default: !!body.is_default,
    fields: Array.isArray(body.fields) && body.fields.length ? body.fields : DEFAULT_FIELDS,
    created_at: new Date().toISOString(),
  };
  if (tpl.is_default) {
    data.checklist_templates.forEach((c) => {
      if (c.partner_id === partnerId) c.is_default = false;
    });
  }
  data.checklist_templates.push(tpl);
  persist(db);
  return tpl;
}

function updateTemplate(partnerId, id, body) {
  const { db, data } = store();
  const tpl = data.checklist_templates.find((c) => c.id === id && c.partner_id === partnerId);
  if (!tpl) {
    const err = new Error('Checklist not found');
    err.status = 404;
    throw err;
  }
  if (body.name != null) tpl.name = body.name;
  if (body.description != null) tpl.description = body.description;
  if (Array.isArray(body.fields)) tpl.fields = body.fields;
  if (body.is_default) {
    data.checklist_templates.forEach((c) => {
      if (c.partner_id === partnerId) c.is_default = c.id === id;
    });
  }
  tpl.updated_at = new Date().toISOString();
  persist(db);
  return tpl;
}

/**
 * Delete a checklist template.
 * Guards:
 *  - Cannot delete if it is the only template for the partner.
 *  - Cannot delete the default; must promote another first.
 *  - Cannot delete if any open orders reference this checklist_template_id.
 */
function deleteTemplate(partnerId, id) {
  const { db, data } = store();
  const tpl = data.checklist_templates.find((c) => c.id === id && c.partner_id === partnerId);
  if (!tpl) {
    const err = new Error('Checklist not found');
    err.status = 404;
    throw err;
  }
  const partnerTemplates = data.checklist_templates.filter((c) => c.partner_id === partnerId);
  if (partnerTemplates.length <= 1) {
    const err = new Error('Cannot delete the last checklist template — at least one must exist for order creation');
    err.status = 400;
    throw err;
  }
  if (tpl.is_default) {
    const err = new Error('Cannot delete the default checklist — promote another template to default first');
    err.status = 400;
    throw err;
  }
  const TERMINAL = ['paid', 'delivered', 'cancelled'];
  const inUse = (data.orders || []).some(
    (o) => o.checklist_template_id === id && o.partner_id === partnerId && !TERMINAL.includes(o.status)
  );
  if (inUse) {
    const err = new Error('Checklist is referenced by one or more open orders — close them before deleting');
    err.status = 409;
    throw err;
  }
  data.checklist_templates = data.checklist_templates.filter(
    (c) => !(c.id === id && c.partner_id === partnerId)
  );
  persist(db);
  return { deleted: id };
}

function defaultForPartner(partnerId) {
  const list = ensureDefault(partnerId);
  return list.find((c) => c.is_default) || list[0];
}

module.exports = {
  DEFAULT_FIELDS,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  defaultForPartner,
};
