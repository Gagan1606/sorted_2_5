const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema({
  photoData: {
    type: Buffer,
    required: true
  },
  mediumImage: Buffer,      // ADD THIS
  thumbnail: Buffer,   
  contentType: {
    type: String,
    required: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
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
  capturedAt: {
    type: Date,
    required: true  // From EXIF data or upload time
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  imageHash: {
    type: String,  // For duplicate detection
    required: true
  }
});

// Indexes for faster queries
photoSchema.index({ group: 1, capturedAt: -1 });
photoSchema.index({ uploadedBy: 1 });
photoSchema.index({ 'detectedFaces.user': 1 });
photoSchema.index({ imageHash: 1 });  // For duplicate detection

module.exports = mongoose.model('Photo', photoSchema);