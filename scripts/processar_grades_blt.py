#!/usr/bin/env python3
"""
Processa imagens do catálogo BLT: detecta múltiplos produtos, recorta em variantes,
adiciona marca d'água centralizada (op30).
"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import json

CATALOGO = Path("public/produtos/catalogo")
OUTPUT = Path("public/produtos/catalogo_processado_blt")
LOGO = Path("public/logo-nuvem.png")
OPACITY = 0.3

def detectar_variacoes(img):
    """Analisa imagem e retorna quantos produtos detectou (heurística simples)."""
    width, height = img.size

    # Heurística: se a imagem tiver >90% branco ou for muito larga,
    # provavelmente tem múltiplos produtos lado a lado
    pixels = img.convert('RGB').getdata()
    brancos = sum(1 for r, g, b in pixels if r > 240 and g > 240 and b > 240)
    pct_branco = brancos / len(pixels)

    # Proporção largura/altura
    ratio = width / height

    # Decisão heurística
    if ratio > 1.8:  # muito largo = 2+ produtos
        if ratio > 3.0:
            return 4  # muito largo = 4 produtos
        return 2
    elif pct_branco > 0.7:  # muito branco = múltiplos produtos com espaço
        return 2
    else:
        return 1  # produto único

def recortar_variantes(img, num_variantes):
    """Recorta imagem em N variantes (divisão simples horizontal)."""
    width, height = img.size
    variantes = []

    if num_variantes == 1:
        return [img]

    # Divisão horizontal em N partes
    largura_parte = width // num_variantes

    for i in range(num_variantes):
        left = i * largura_parte
        right = (i + 1) * largura_parte if i < num_variantes - 1 else width
        crop = img.crop((left, 0, right, height))

        # Redimensionar para quadrado mantendo aspecto
        size = max(crop.size)
        quadrado = Image.new('RGB', (size, size), 'white')
        offset = ((size - crop.width) // 2, (size - crop.height) // 2)
        quadrado.paste(crop, offset)

        variantes.append(quadrado)

    return variantes

def adicionar_marca_dagua(img, logo_path, opacity=0.3):
    """Adiciona logo no centro com opacidade."""
    logo = Image.open(logo_path).convert("RGBA")

    # Redimensionar logo para ~36% da largura da imagem
    target_width = int(img.width * 0.36)
    ratio = target_width / logo.width
    target_height = int(logo.height * ratio)
    logo = logo.resize((target_width, target_height), Image.Resampling.LANCZOS)

    # Aplicar opacidade
    logo_alpha = logo.getchannel('A')
    logo_alpha = logo_alpha.point(lambda p: int(p * opacity))
    logo.putalpha(logo_alpha)

    # Colar no centro
    img_rgba = img.convert("RGBA")
    pos = ((img.width - logo.width) // 2, (img.height - logo.height) // 2)
    img_rgba.paste(logo, pos, logo)

    return img_rgba.convert("RGB")

def processar_arquivo(sku_original):
    """Processa um arquivo BLT."""
    img_path = CATALOGO / sku_original
    if not img_path.exists():
        return {"erro": "arquivo não existe"}

    img = Image.open(img_path)
    num_variantes = detectar_variacoes(img)

    # Recortar em variantes
    variantes = recortar_variantes(img, num_variantes)

    # Salvar cada variante com marca d'água
    sku_base = img_path.stem  # sem extensão
    resultados = []

    for i, variante in enumerate(variantes):
        if not LOGO.exists():
            # Sem logo, só salva a variante
            variante_final = variante
        else:
            variante_final = adicionar_marca_dagua(variante, LOGO, OPACITY)

        # Nomenclatura: primeiro = SKU.jpg, demais = SKUA.jpg, SKUB.jpg...
        if i == 0:
            nome = f"{sku_base}.jpg"
        else:
            sufixo = chr(ord('A') + i - 1)  # A, B, C...
            nome = f"{sku_base}{sufixo}.jpg"

        output_path = OUTPUT / nome
        variante_final.save(output_path, "JPEG", quality=95)
        resultados.append(nome)

    return {
        "original": sku_original,
        "detectado": num_variantes,
        "gerados": resultados
    }

def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)

    # Processar lista de arquivos recebida via stdin ou args
    if len(sys.argv) > 1:
        arquivos = sys.argv[1:]
    else:
        # Ler do stdin
        arquivos = [line.strip() for line in sys.stdin if line.strip()]

    relatorio = []
    for i, arq in enumerate(arquivos, 1):
        print(f"[{i}/{len(arquivos)}] Processando {arq}...", file=sys.stderr)
        resultado = processar_arquivo(arq)
        relatorio.append(resultado)

    # Salvar relatório JSON
    relatorio_path = OUTPUT / "_relatorio.json"
    with open(relatorio_path, 'w', encoding='utf-8') as f:
        json.dump(relatorio, f, indent=2, ensure_ascii=False)

    print(json.dumps(relatorio, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
