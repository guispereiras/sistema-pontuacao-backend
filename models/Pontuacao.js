const mongoose = require('mongoose');

const pontuacaoSchema = new mongoose.Schema({
  atividadeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Atividade',
    required: true
  },
  timeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Time',
    required: function() {
      return !this.participanteId;
    }
  },
  participanteId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participante',
    required: function() {
      return !this.timeId;
    }
  },
  pontos: {
    type: Number,
    required: true
  },
  juizNome: {
    type: String,
    required: true,
    trim: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Pontuacao', pontuacaoSchema);