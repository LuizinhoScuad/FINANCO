const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient({ log: ['error'] });

const expenseCategories = [
    { name: "Alimentação", icon: "🍔", color: "#f59e0b" },
    { name: "Transporte", icon: "🚗", color: "#60a5fa" },
    { name: "Saúde", icon: "🏥", color: "#34d399" },
    { name: "Moradia", icon: "🏠", color: "#f97316" },
    { name: "Lazer", icon: "🎬", color: "#a78bfa" },
    { name: "Vestuário", icon: "👕", color: "#fb7185" },
    { name: "Educação", icon: "📚", color: "#22d3ee" },
    { name: "Eletrônicos", icon: "📱", color: "#6366f1" },
    { name: "Mercado", icon: "🛒", color: "#84cc16" },
    { name: "Outros desp.", icon: "🔧", color: "#6b7a99" },
];

const incomeCategories = [
    { name: "Salário", icon: "💰", color: "#00d98b" },
    { name: "Freelance", icon: "💼", color: "#00d98b" },
    { name: "Investimentos", icon: "📈", color: "#00d98b" },
    { name: "Outros receit.", icon: "✨", color: "#00d98b" },
];

async function main() {
    console.log("🌱 Semeando dados iniciais...");

    for (const cat of expenseCategories) {
        await db.category.create({ data: { ...cat, type: "EXPENSE" } }).catch(() => null);
    }

    for (const cat of incomeCategories) {
        await db.category.create({ data: { ...cat, type: "INCOME" } }).catch(() => null);
    }

    // Conta padrão
    await db.account.create({
        data: { name: "Carteira", type: "CASH", color: "#00d98b", balance: 0 },
    }).catch(() => null);

    console.log("✅ Seed concluído!");
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => db.$disconnect());
