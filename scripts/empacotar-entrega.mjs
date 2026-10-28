// Gera a entrega: entrega/rede-alimentams.zip (código, a partir do último commit) e o PDF do relatório ao lado.
// Usa `git archive`, que respeita os `export-ignore` de .gitattributes (automação, VPS, roteiros internos).
// Uso, na raiz do projeto: node scripts/empacotar-entrega.mjs
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: raiz, encoding: 'utf8' }).trim();

const pendentes = git('status', '--porcelain', '--untracked-files=no');
if (pendentes) {
  console.error('Há alterações não commitadas; elas NÃO entrariam no pacote:\n' + pendentes);
  console.error('Faça o commit e rode de novo.');
  process.exit(1);
}

const commit = git('rev-parse', '--short', 'HEAD');
const destino = path.join(raiz, 'entrega', 'rede-alimentams.zip');
mkdirSync(path.dirname(destino), { recursive: true });
git('archive', '--format=zip', '--prefix=rede-alimentams/', '-o', destino, 'HEAD');

// O relatório técnico vai separado do zip (pedido do professor): copiado ao lado, para juntar os dois na entrega.
const relatorio = path.join(raiz, 'entrega', 'Relatorio_Tecnico_Rede_AlimentaMS.pdf');
copyFileSync(path.join(raiz, 'docs', 'RELATORIO_TECNICO_FINAL.pdf'), relatorio);

console.log(`Pacote gerado: ${path.relative(raiz, destino)} (${Math.round(statSync(destino).size / 1024)} KB, commit ${commit}).`);
console.log(`Relatório: ${path.relative(raiz, relatorio)} (${Math.round(statSync(relatorio).size / 1024)} KB).`);
console.log('Para conferir: descompacte numa pasta vazia e rode `docker compose up -d --build` lá dentro.');
