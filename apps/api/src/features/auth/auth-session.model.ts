import { Schema, model } from 'mongoose';
const sessionSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },
    usedTokenHashes: { type: [String], default: [], select: false },
    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    revokedAt: Date,
    deviceLabel: String,
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ usedTokenHashes: 1 }, { sparse: true });
export const AuthSession = model('AuthSession', sessionSchema);
