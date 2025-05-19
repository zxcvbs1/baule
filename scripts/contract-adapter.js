// scripts/contract-adapter.js
const fs = require('fs');
const path = require('path');

// Leer el archivo original
const contractFilePath = path.join(__dirname, '../src/lib/contract.ts');
const contractFileContent = fs.readFileSync(contractFilePath, 'utf8');

// Extraer valores usando expresiones regulares
const addressRegex = /export const secureBorrowingContractAddress = ['"]([^'"]+)['"]/;
const addressMatch = contractFileContent.match(addressRegex);
const secureBorrowingContractAddress = addressMatch ? addressMatch[1] : '';

// Extraer el ABI - esto es más complejo ya que el ABI es un objeto JSON grande
// Primero obtenemos la cadena que comienza con export const secureBorrowingABI = [
const abiStartRegex = /export const secureBorrowingABI = \[/;
const abiStart = contractFileContent.indexOf('export const secureBorrowingABI = [');
if (abiStart === -1) {
  throw new Error('No se pudo encontrar el ABI en el archivo contract.ts');
}

// Luego necesitamos encontrar el final del array (el último corchete que lo cierra)
// Esto es complicado de hacer con regex, así que usaremos un contador de corchetes
let openBrackets = 1; // Ya contamos el primer corchete de apertura
let abiEnd = abiStart + 'export const secureBorrowingABI = ['.length;
while (openBrackets > 0 && abiEnd < contractFileContent.length) {
  if (contractFileContent[abiEnd] === '[') openBrackets++;
  if (contractFileContent[abiEnd] === ']') openBrackets--;
  abiEnd++;
}

// Extraemos el contenido del ABI como una cadena
const abiString = contractFileContent.substring(
  abiStart + 'export const secureBorrowingABI = '.length, 
  abiEnd
);

// Convertimos la cadena a un objeto JavaScript
const secureBorrowingABI = eval(abiString);

// Exportamos las constantes para usar en otros archivos
module.exports = {
  secureBorrowingContractAddress,
  secureBorrowingABI
};
