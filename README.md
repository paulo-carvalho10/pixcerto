# PixCerto

Gerador e conferidor de cobranca Pix que roda inteiramente no navegador.
Implementa o BR Code (padrao EMV MPM, perfil Pix do Banco Central) do zero:
montagem dos campos, CRC16 e leitura de volta.

**A chave Pix nunca sai do dispositivo.** Nao ha back-end, nao ha requisicao de
rede, nao ha telemetria. Todo o calculo acontece em memoria.

## Estado

Em construcao. O nucleo do BR Code esta pronto e testado; a interface e as
exportacoes ainda nao.

| Etapa | Situacao |
|---|---|
| Campos EMV (TLV) | pronto |
| CRC16-CCITT-FALSE | pronto |
| Montagem do payload | pronto |
| Validacao de chave, valor e texto | pronto |
| Decodificador com arvore de campos | pronto |
| Interface | pendente |
| QR em PNG e SVG | pendente |
| Cartaz A4 e PDF | pendente |
| Deploy | pendente |

## Como rodar

Requer Node 20 ou superior.

```bash
npm install
npm test         # suite completa
npm run typecheck
```

## O que e o BR Code

A string do "Pix copia e cola" e uma sequencia de campos no formato TLV:

```
ID (2 digitos) + Tamanho (2 digitos) + Valor
```

Por exemplo, `5802BR` e o campo `58` (pais), com `02` caracteres, valendo `BR`.

Campos de um Pix estatico:

| ID | Campo | Conteudo |
|---|---|---|
| `00` | Versao do formato | fixo `01` |
| `01` | Metodo de iniciacao | `12` para uso unico; ausente significa reutilizavel |
| `26` | Dados da conta | template aninhado do Pix |
| `52` | Categoria do estabelecimento | `0000` quando nao informado |
| `53` | Moeda | `986` (real) |
| `54` | Valor | opcional; `123.45`, ponto decimal |
| `58` | Pais | `BR` |
| `59` | Nome do recebedor | ate 25 caracteres |
| `60` | Cidade | ate 15 caracteres |
| `61` | CEP | opcional |
| `62` | Dados adicionais | template aninhado com o txid |
| `63` | CRC16 | sempre o ultimo campo |

Os campos `26` e `62` tem outros campos dentro do valor:

- `26` → `00` GUI `br.gov.bcb.pix`, `01` chave Pix, `02` descricao
- `62` → `05` txid; sem identificador, o padrao manda enviar `***`

## Decisoes tecnicas

**O CRC cobre o proprio cabecalho.** O campo 63 e calculado sobre a string ja
contendo `6304`. E o detalhe que mais derruba implementacao caseira: monta-se o
payload inteiro, concatena-se `6304` e so entao calcula-se o CRC dos 4
hexadecimais que vem em seguida.

**CCITT-FALSE, nao qualquer CRC16.** Polinomio `0x1021`, inicio `0xFFFF`, sem
reflexao, XOR final `0x0000`. Existem variantes de nome parecido que produzem
resultados diferentes. A escolha esta travada por dois vetores independentes:

1. o valor de conferencia do catalogo, `crc16("123456789") == 0x29B1`;
2. o exemplo publicado no manual do BR Code, que o gerador reproduz caractere a
   caractere, CRC `1D3D` incluido.

O segundo e o teste mais valioso do projeto: se a ordem dos campos, alguma
contagem de tamanho ou o CRC estiverem errados, ele quebra.

**Dinheiro em centavos inteiros.** Nenhum valor circula como float. `0.1 + 0.2`
em ponto flutuante nao da `0.3`, e um centavo errado no campo 54 e uma cobranca
errada. A entrada aceita as formas usuais (`10`, `10,50`, `R$ 1.234,56`,
`1,234.56`) e vira um inteiro de centavos na primeira oportunidade.

**Tudo em ASCII, por necessidade do formato.** O tamanho do campo conta bytes.
Um "Joao" com til ocupa dois bytes em UTF-8 e desalinha a leitura de tudo que
vem depois. Acentos sao removidos preservando a letra base, e `field()` recusa
qualquer coisa fora do ASCII imprimivel em vez de gerar um QR silenciosamente
quebrado.

**A chave e a descricao dividem 99 caracteres.** O campo 26 inteiro cabe em 99
caracteres, e o GUI ja consome 18. Uma chave de e-mail no limite de 77 nao
deixa espaco nenhum para a descricao. O gerador calcula esse orcamento, corta a
descricao no que couber e avisa quando o faz, em vez de emitir um campo maior
que o formato permite.

**O decodificador existe para provar o gerador.** Se
`decodePix(buildPixPayload(x))` nao devolve `x`, uma das duas metades esta
errada. Esse teste de ida e volta cobre nove combinacoes de entrada e nao
depende de nenhum aplicativo de banco para rodar.

## Avisos

- Um QR estatico **nao confirma pagamento**. Conferir o recebimento no extrato e
  responsabilidade de quem cobra.
- A validacao e de formato e de digito verificador. Uma chave bem formada pode
  simplesmente nao existir; isso so o DICT responde, e este projeto nao consulta
  servico nenhum.
- Os CPFs e CNPJs usados nos testes sao ficticios. Tem digito verificador valido
  de proposito, para exercitar a validacao, e nao pertencem a ninguem.

## Licenca

MIT.
