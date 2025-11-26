const mongoose = require('mongoose');
const deviceSchema = new mongoose.Schema({
  mac: String,
  locationId: String,
  address: String,
  latitude: Number,
  longitude: Number,
  ipCamera: { type: String, default: '' }  // ✅ New field
});

module.exports = mongoose.model('Device', deviceSchema);
