
const { db } = require('./lib/db');

async function test() {
  console.log('Iniciando teste de consulta...');
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    console.log(`Buscando transações entre ${start.toISOString()} e ${end.toISOString()}...`);
    
    const startTime = Date.now();
    const transactions = await db.transaction.findMany({
      where: {
        date: { gte: start, lte: end }
      },
      include: { category: true, account: true },
      orderBy: { date: 'desc' }
    });
    const duration = Date.now() - startTime;

    console.log(`Encontradas ${transactions.length} transações em ${duration}ms.`);
    
    if (transactions.length > 0) {
      console.log('Exemplo de transação:', {
        description: transactions[0].description,
        amount: transactions[0].amount,
        date: transactions[0].date,
        category: transactions[0].category?.name,
        account: transactions[0].account?.name
      });
    }

    // Teste de saldo total
    const totalBalance = await db.account.findMany({ select: { balance: true } });
    console.log('Saldos das contas:', totalBalance);

  } catch (error) {
    console.error('Erro no teste:', error);
  }
}

test();
