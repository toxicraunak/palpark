const mongoose = require('mongoose');

const inventorySlotSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  itemRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name: String,
  category: String,
  quantity: { type: Number, default: 1, min: 0 },
  acquiredAt: { type: Date, default: Date.now },
  lastUsedAt: Date,
}, { _id: false });

const inventorySchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  slots: [inventorySlotSchema],
  maxSlots: { type: Number, default: 200 },
  quickSlots: [{ type: String }], // itemIds pinned to quick access

  // Tracked aggregates for fast lookups
  totalItems: { type: Number, default: 0 },
  lastUpdatedAt: { type: Date, default: Date.now },
}, { timestamps: true });

inventorySchema.methods.addItem = function (itemId, quantity = 1, itemData = {}) {
  const existing = this.slots.find(s => s.itemId === itemId);
  if (existing) {
    existing.quantity += quantity;
  } else {
    this.slots.push({ itemId, quantity, ...itemData });
  }
  this.totalItems = this.slots.reduce((sum, s) => sum + s.quantity, 0);
  this.lastUpdatedAt = new Date();
};

inventorySchema.methods.removeItem = function (itemId, quantity = 1) {
  const slot = this.slots.find(s => s.itemId === itemId);
  if (!slot || slot.quantity < quantity) throw new Error(`Insufficient ${itemId}`);
  slot.quantity -= quantity;
  if (slot.quantity <= 0) {
    this.slots = this.slots.filter(s => s.itemId !== itemId);
  }
  this.totalItems = this.slots.reduce((sum, s) => sum + s.quantity, 0);
  this.lastUpdatedAt = new Date();
};

inventorySchema.methods.hasItem = function (itemId, quantity = 1) {
  const slot = this.slots.find(s => s.itemId === itemId);
  return slot && slot.quantity >= quantity;
};

inventorySchema.methods.getItemQuantity = function (itemId) {
  const slot = this.slots.find(s => s.itemId === itemId);
  return slot ? slot.quantity : 0;
};

inventorySchema.index({ owner: 1 });
inventorySchema.index({ 'slots.itemId': 1 });

module.exports = mongoose.model('Inventory', inventorySchema);
