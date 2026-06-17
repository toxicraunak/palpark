const mongoose = require('mongoose');

const marketplaceListingSchema = new mongoose.Schema({
  listingId: { type: String, required: true, unique: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sellerUsername: String,

  listingType: { type: String, enum: ['monster', 'item'], required: true },
  monster: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerMonster' },
  monsterSnapshot: {
    templateId: Number,
    name: String,
    nickname: String,
    level: Number,
    isShiny: Boolean,
    rarity: String,
    types: { primary: String, secondary: String },
    calculatedStats: mongoose.Schema.Types.Mixed,
    ivTotal: Number,
  },
  item: { itemId: String, name: String, category: String, quantity: Number },

  price: {
    type: { type: String, enum: ['coins', 'gems', 'tokens', 'trade'], required: true },
    amount: { type: Number, required: true, min: 1 },
  },
  tradeFor: { monsterIds: [Number], itemIds: [String] },

  status: { type: String, enum: ['active', 'sold', 'cancelled', 'expired'], default: 'active' },
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  buyerUsername: String,
  soldAt: Date,
  cancelledAt: Date,
  expiresAt: { type: Date, required: true },

  views: { type: Number, default: 0 },
  watchers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  featured: { type: Boolean, default: false },
  tags: [String],
}, { timestamps: true });

marketplaceListingSchema.index({ seller: 1 });
marketplaceListingSchema.index({ status: 1, expiresAt: 1 });
marketplaceListingSchema.index({ listingType: 1, status: 1 });
marketplaceListingSchema.index({ 'monsterSnapshot.rarity': 1 });
marketplaceListingSchema.index({ 'monsterSnapshot.isShiny': 1 });
marketplaceListingSchema.index({ 'price.amount': 1 });
marketplaceListingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Marketplace', marketplaceListingSchema);
