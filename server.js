const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Conexão com MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sistema-pontuacao', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Conectado ao MongoDB'))
.catch(err => console.error('❌ Erro ao conectar MongoDB:', err));

// Modelos
const Time = require('./models/Time');
const Participante = require('./models/Participante');
const Atividade = require('./models/Atividade');
const Pontuacao = require('./models/Pontuacao');

// Função para gerar código único
function gerarCodigo() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

// ===== ROTAS PÚBLICAS =====

// Listar times com pontuação
app.get('/api/times', async (req, res) => {
  try {
    const times = await Time.find().sort({ pontos: -1 });
    res.json(times);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ranking completo
app.get('/api/ranking', async (req, res) => {
  try {
    const times = await Time.find().sort({ pontos: -1 });
    const participantes = await Participante.find().populate('timeId').sort({ pontos: -1 });
    
    res.json({
      times,
      participantes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS ADMINISTRATIVAS =====

// Inicializar times (executar uma vez)
app.post('/api/admin/init-times', async (req, res) => {
  try {
    const timesExistentes = await Time.countDocuments();
    if (timesExistentes > 0) {
      return res.json({ message: 'Times já foram inicializados' });
    }

    const times = [
      { nome: 'Onça', pontos: 0, cor: '#FF5722' },
      { nome: 'Leão', pontos: 0, cor: '#FFC107' },
      { nome: 'Tigre', pontos: 0, cor: '#FF9800' },
      { nome: 'Lobo', pontos: 0, cor: '#607D8B' }
    ];

    await Time.insertMany(times);
    res.json({ message: 'Times inicializados com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar participantes
app.get('/api/admin/participantes', async (req, res) => {
  try {
    const participantes = await Participante.find().populate('timeId');
    res.json(participantes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adicionar participante
app.post('/api/admin/participantes', async (req, res) => {
  try {
    const { nome, timeId } = req.body;
    
    if (!nome || !timeId) {
      return res.status(400).json({ error: 'Nome e time são obrigatórios' });
    }

    const participante = new Participante({
      nome,
      timeId,
      pontos: 0
    });

    await participante.save();
    await participante.populate('timeId');
    
    res.status(201).json(participante);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Criar atividade
app.post('/api/admin/atividades', async (req, res) => {
  try {
    const { nome, tipo } = req.body;
    
    if (!nome || !tipo) {
      return res.status(400).json({ error: 'Nome e tipo são obrigatórios' });
    }

    if (!['individual', 'equipe'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo deve ser "individual" ou "equipe"' });
    }

    const atividade = new Atividade({
      nome,
      tipo,
      codigo: gerarCodigo(),
      ativa: true
    });

    await atividade.save();
    res.status(201).json(atividade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Listar atividades
app.get('/api/admin/atividades', async (req, res) => {
  try {
    const atividades = await Atividade.find().sort({ criadaEm: -1 });
    res.json(atividades);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Desativar atividade
app.put('/api/admin/atividades/:id/desativar', async (req, res) => {
  try {
    const atividade = await Atividade.findByIdAndUpdate(
      req.params.id,
      { ativa: false },
      { new: true }
    );
    
    if (!atividade) {
      return res.status(404).json({ error: 'Atividade não encontrada' });
    }
    
    res.json(atividade);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS PARA JUÍZES =====

// Buscar atividade por código
app.get('/api/atividade/:codigo', async (req, res) => {
  try {
    const atividade = await Atividade.findOne({ 
      codigo: req.params.codigo.toUpperCase(),
      ativa: true 
    });
    
    if (!atividade) {
      return res.status(404).json({ error: 'Código inválido ou atividade inativa' });
    }

    let dados = { atividade };

    if (atividade.tipo === 'equipe') {
      dados.times = await Time.find();
    } else {
      dados.participantes = await Participante.find().populate('timeId');
    }

    res.json(dados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Registrar pontuação
app.post('/api/pontuacao', async (req, res) => {
  try {
    const { atividadeId, timeId, participanteId, pontos, juizNome } = req.body;
    
    if (!atividadeId || !pontos || !juizNome) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    const atividade = await Atividade.findById(atividadeId);
    if (!atividade || !atividade.ativa) {
      return res.status(404).json({ error: 'Atividade não encontrada ou inativa' });
    }

    // Verificar se já existe pontuação para essa atividade e participante/time
    const pontuacaoExistente = await Pontuacao.findOne({
      atividadeId,
      $or: [
        { timeId: timeId || null },
        { participanteId: participanteId || null }
      ]
    });

    if (pontuacaoExistente) {
      return res.status(400).json({ error: 'Pontuação já registrada para esta atividade' });
    }

    const pontuacao = new Pontuacao({
      atividadeId,
      timeId: atividade.tipo === 'equipe' ? timeId : null,
      participanteId: atividade.tipo === 'individual' ? participanteId : null,
      pontos,
      juizNome
    });

    await pontuacao.save();

    // Atualizar pontos do time ou participante
    if (atividade.tipo === 'equipe') {
      await Time.findByIdAndUpdate(timeId, { $inc: { pontos: pontos } });
    } else {
      await Participante.findByIdAndUpdate(participanteId, { $inc: { pontos: pontos } });
      // Também atualizar pontos do time do participante
      const participante = await Participante.findById(participanteId);
      await Time.findByIdAndUpdate(participante.timeId, { $inc: { pontos: pontos } });
    }

    res.status(201).json({ message: 'Pontuação registrada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS DE UTILIDADE =====

// Reset completo (cuidado!)
app.post('/api/admin/reset', async (req, res) => {
  try {
    await Pontuacao.deleteMany({});
    await Atividade.deleteMany({});
    await Participante.deleteMany({});
    await Time.updateMany({}, { pontos: 0 });
    
    res.json({ message: 'Sistema resetado com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📍 Acesse: http://localhost:${PORT}`);
});