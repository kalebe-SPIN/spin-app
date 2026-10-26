<?php
/**
 * Ponte Spin Solar → API do fornecedor (Kalebe 2026-10-26).
 * O sistema (app.spinsolar.com.br, na Vercel) não tem IP fixo; esta ponte
 * fica no spinsolar.com.br (HostGator) e faz a chamada ao fornecedor — ele
 * enxerga o IP da HostGator e é esse IP que ele libera.
 *
 * Segurança:
 *  - só aceita chamada com o cabeçalho X-Spin-Token igual ao TOKEN abaixo
 *  - só repassa pros domínios da lista DESTINOS (https)
 *  - não guarda nada
 *
 * Instalação: cPanel → Gerenciador de Arquivos → public_html → criar a
 * pasta "spin-ponte" → enviar este arquivo como "ponte.php" → editar as duas
 * linhas abaixo (TOKEN e o domínio da API do fornecedor).
 */

// 1) Um token longo e aleatório (o mesmo vai no cadastro do fornecedor no sistema)
$TOKEN = 'TROQUE-POR-UM-TOKEN-LONGO-E-ALEATORIO';

// 2) Domínio da API do fornecedor (sem https:// e sem barra). api.ipify.org é só pro teste de IP.
$DESTINOS = ['COLOQUE-AQUI-O-DOMINIO-DA-API-DO-FORNECEDOR', 'api.ipify.org'];

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function responder($codigo, $dados) {
  http_response_code($codigo);
  echo json_encode($dados, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') responder(405, ['erro' => 'use POST']);
if (strlen($TOKEN) < 24 || strpos($TOKEN, 'TROQUE') === 0) responder(500, ['erro' => 'ponte sem token configurado']);
$recebido = isset($_SERVER['HTTP_X_SPIN_TOKEN']) ? $_SERVER['HTTP_X_SPIN_TOKEN'] : '';
if (!hash_equals($TOKEN, $recebido)) responder(401, ['erro' => 'nao autorizado']);

$entrada = json_decode(file_get_contents('php://input'), true);
if (!is_array($entrada)) responder(400, ['erro' => 'corpo invalido']);

$url = isset($entrada['url']) ? (string) $entrada['url'] : '';
$p = parse_url($url);
$host = strtolower(isset($p['host']) ? $p['host'] : '');
if ((isset($p['scheme']) ? $p['scheme'] : '') !== 'https' || !in_array($host, array_map('strtolower', $DESTINOS), true)) {
  responder(403, ['erro' => 'destino nao permitido: ' . $host]);
}

$metodo = strtoupper(isset($entrada['method']) ? (string) $entrada['method'] : 'GET');
if (!in_array($metodo, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], true)) responder(400, ['erro' => 'metodo invalido']);

$cabecalhos = [];
if (isset($entrada['headers']) && is_array($entrada['headers'])) {
  foreach ($entrada['headers'] as $nome => $valor) {
    if (!preg_match('/^[A-Za-z0-9-]{1,64}$/', (string) $nome)) continue;
    $cabecalhos[] = $nome . ': ' . str_replace(["\r", "\n"], '', (string) $valor);
  }
}

$ch = curl_init($url);
curl_setopt_array($ch, [
  CURLOPT_CUSTOMREQUEST => $metodo,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => $cabecalhos,
  CURLOPT_TIMEOUT => 25,
  CURLOPT_CONNECTTIMEOUT => 10,
  CURLOPT_FOLLOWLOCATION => false,
  CURLOPT_SSL_VERIFYPEER => true,
]);
if (isset($entrada['body']) && $entrada['body'] !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, (string) $entrada['body']);
$corpo = curl_exec($ch);
if ($corpo === false) {
  $erro = curl_error($ch);
  curl_close($ch);
  responder(502, ['erro' => 'falha ao chamar o fornecedor: ' . $erro]);
}
$status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
curl_close($ch);
responder(200, ['status' => $status, 'corpo' => $corpo]);
