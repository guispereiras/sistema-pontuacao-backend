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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/sistema-pontuacao')
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
    
    if (!atividadeId || pontos === undefined || pontos === null || !juizNome) {
      return res.status(400).json({ error: 'Dados obrigatórios faltando' });
    }

    const atividade = await Atividade.findById(atividadeId);
    if (!atividade || !atividade.ativa) {
      return res.status(404).json({ error: 'Atividade não encontrada ou inativa' });
    }

    // CORREÇÃO: Verificar se o MESMO JUIZ já votou no MESMO ALVO
    const pontuacaoExistente = await Pontuacao.findOne({
      atividadeId,
      juizNome: juizNome, // Mesmo juiz
      $or: [
        { timeId: timeId || null },
        { participanteId: participanteId || null }
      ]
    });

    if (pontuacaoExistente) {
      return res.status(400).json({ error: 'Você já pontuou este time/participante nesta atividade' });
    }

    const pontuacao = new Pontuacao({
      atividadeId,
      timeId: atividade.tipo === 'equipe' ? timeId : null,
      participanteId: atividade.tipo === 'individual' ? participanteId : null,
      pontos: Number(pontos), // Aceita números negativos
      juizNome
    });

    await pontuacao.save();

    // Atualizar pontos do time ou participante (aceita negativos)
    if (atividade.tipo === 'equipe') {
      await Time.findByIdAndUpdate(timeId, { $inc: { pontos: Number(pontos) } });
    } else {
      await Participante.findByIdAndUpdate(participanteId, { $inc: { pontos: Number(pontos) } });
      // Também atualizar pontos do time do participante
      const participante = await Participante.findById(participanteId);
      await Time.findByIdAndUpdate(participante.timeId, { $inc: { pontos: Number(pontos) } });
    }

    res.status(201).json({ message: 'Pontuação registrada com sucesso!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== ROTAS PARA RELATÓRIOS DE JUÍZES =====

// Histórico completo de pontuações
app.get('/api/pontuacoes/historico', async (req, res) => {
  try {
    const pontuacoes = await Pontuacao.find()
      .populate('atividadeId', 'nome tipo codigo')
      .populate('timeId', 'nome cor')
      .populate('participanteId', 'nome')
      .sort({ createdAt: -1 });

    // Organizar dados para o frontend
    const historicoFormatado = pontuacoes.map(pont => ({
      _id: pont._id,
      juizNome: pont.juizNome,
      pontos: pont.pontos,
      dataHora: pont.createdAt,
      atividade: {
        nome: pont.atividadeId.nome,
        tipo: pont.atividadeId.tipo,
        codigo: pont.atividadeId.codigo
      },
      alvo: pont.timeId ? {
        tipo: 'time',
        nome: pont.timeId.nome,
        cor: pont.timeId.cor
      } : {
        tipo: 'participante',
        nome: pont.participanteId.nome
      }
    }));

    res.json(historicoFormatado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Relatório por juiz
app.get('/api/pontuacoes/por-juiz', async (req, res) => {
  try {
    const relatorio = await Pontuacao.aggregate([
      {
        $lookup: {
          from: 'atividades',
          localField: 'atividadeId',
          foreignField: '_id',
          as: 'atividade'
        }
      },
      {
        $lookup: {
          from: 'times',
          localField: 'timeId',
          foreignField: '_id',
          as: 'time'
        }
      },
      {
        $lookup: {
          from: 'participantes',
          localField: 'participanteId',
          foreignField: '_id',
          as: 'participante'
        }
      },
      {
        $group: {
          _id: '$juizNome',
          totalPontuacoes: { $sum: 1 },
          totalPontos: { $sum: '$pontos' },
          pontuacoes: {
            $push: {
              pontos: '$pontos',
              dataHora: '$createdAt',
              atividade: { $arrayElemAt: ['$atividade.nome', 0] },
              atividadeCodigo: { $arrayElemAt: ['$atividade.codigo', 0] },
              atividadeTipo: { $arrayElemAt: ['$atividade.tipo', 0] },
              timeNome: { $arrayElemAt: ['$time.nome', 0] },
              timeCor: { $arrayElemAt: ['$time.cor', 0] },
              participanteNome: { $arrayElemAt: ['$participante.nome', 0] }
            }
          }
        }
      },
      {
        $project: {
          juizNome: '$_id',
          totalPontuacoes: 1,
          totalPontos: 1,
          mediaPontos: { $divide: ['$totalPontos', '$totalPontuacoes'] },
          pontuacoes: 1,
          _id: 0
        }
      },
      {
        $sort: { totalPontuacoes: -1 }
      }
    ]);

    res.json(relatorio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Relatório por atividade
app.get('/api/pontuacoes/por-atividade', async (req, res) => {
  try {
    const relatorio = await Pontuacao.aggregate([
      {
        $lookup: {
          from: 'atividades',
          localField: 'atividadeId',
          foreignField: '_id',
          as: 'atividade'
        }
      },
      {
        $lookup: {
          from: 'times',
          localField: 'timeId',
          foreignField: '_id',
          as: 'time'
        }
      },
      {
        $lookup: {
          from: 'participantes',
          localField: 'participanteId',
          foreignField: '_id',
          as: 'participante'
        }
      },
      {
        $group: {
          _id: '$atividadeId',
          nomeAtividade: { $first: { $arrayElemAt: ['$atividade.nome', 0] } },
          tipoAtividade: { $first: { $arrayElemAt: ['$atividade.tipo', 0] } },
          codigoAtividade: { $first: { $arrayElemAt: ['$atividade.codigo', 0] } },
          totalPontuacoes: { $sum: 1 },
          totalPontos: { $sum: '$pontos' },
          juizes: { $addToSet: '$juizNome' },
          pontuacoes: {
            $push: {
              juizNome: '$juizNome',
              pontos: '$pontos',
              dataHora: '$createdAt',
              timeNome: { $arrayElemAt: ['$time.nome', 0] },
              timeCor: { $arrayElemAt: ['$time.cor', 0] },
              participanteNome: { $arrayElemAt: ['$participante.nome', 0] }
            }
          }
        }
      },
      {
        $project: {
          nomeAtividade: 1,
          tipoAtividade: 1,
          codigoAtividade: 1,
          totalPontuacoes: 1,
          totalPontos: 1,
          totalJuizes: { $size: '$juizes' },
          mediaPontos: { $divide: ['$totalPontos', '$totalPontuacoes'] },
          juizes: 1,
          pontuacoes: 1,
          _id: 0
        }
      },
      {
        $sort: { totalPontuacoes: -1 }
      }
    ]);

    res.json(relatorio);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Estatísticas gerais
app.get('/api/pontuacoes/estatisticas', async (req, res) => {
  try {
    const estatisticas = await Pontuacao.aggregate([
      {
        $group: {
          _id: null,
          totalPontuacoes: { $sum: 1 },
          totalPontos: { $sum: '$pontos' },
          mediaPontos: { $avg: '$pontos' },
          maiorPontuacao: { $max: '$pontos' },
          menorPontuacao: { $min: '$pontos' },
          juizesUnicos: { $addToSet: '$juizNome' }
        }
      },
      {
        $project: {
          totalPontuacoes: 1,
          totalPontos: 1,
          mediaPontos: { $round: ['$mediaPontos', 2] },
          maiorPontuacao: 1,
          menorPontuacao: 1,
          totalJuizes: { $size: '$juizesUnicos' },
          juizes: '$juizesUnicos',
          _id: 0
        }
      }
    ]);

    const atividades = await Atividade.countDocuments();
    const times = await Time.countDocuments();
    const participantes = await Participante.countDocuments();

    res.json({
      ...estatisticas[0] || {
        totalPontuacoes: 0,
        totalPontos: 0,
        mediaPontos: 0,
        maiorPontuacao: 0,
        menorPontuacao: 0,
        totalJuizes: 0,
        juizes: []
      },
      totalAtividades: atividades,
      totalTimes: times,
      totalParticipantes: participantes
    });
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