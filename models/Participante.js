const mongoose = require('mongoose');

const participanteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  timeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Time',
    required: true
  },
  pontos: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Participante', participanteSchema);