const mongoose = require('mongoose');

const sharedPhotoSchema = new mongoose.Schema({
  photoData: {
    type: Buffer,
    required: true
  },
  contentType: {
    type: String,
    required: true
  },
  sharedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sharedWith: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  detectedFaces: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    confidence: Number,
    facialArea: {
      x: Number,
      y: Number,
      w: Number,
      h: Number
    }
  }],
  sharedAt: {
    type: Date,
    default: Date.now
  },
  viewed: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: Date
  }]
});

sharedPhotoSchema.index({ sharedWith: 1, sharedAt: -1 });
sharedPhotoSchema.index({ sharedBy: 1 });

module.exports = mongoose.model('SharedPhoto', sharedPhotoSchema);