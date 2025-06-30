const mongoose = require('mongoose');

const atividadeSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    required: true,
    enum: ['individual', 'equipe']
  },
  codigo: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  ativa: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Atividade', atividadeSchema);