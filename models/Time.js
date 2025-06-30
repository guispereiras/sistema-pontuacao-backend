const mongoose = require('mongoose');

const timeSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    unique: true,
    enum: ['Onça', 'Leão', 'Tigre', 'Lobo']
  },
  pontos: {
    type: Number,
    default: 0
  },
  cor: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Time', timeSchema);