const mongoose = require('mongoose');

const groupSchema = new mongoose.Schema({
  groupName: {
    type: String,
    required: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  photos: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Photo'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster group queries
groupSchema.index({ createdBy: 1, groupName: 1 });

module.exports = mongoose.model('Group', groupSchema);
