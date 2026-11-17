#!/usr/bin/env bash
# MoinMorni: Liste der Änderungen für „Was ist neu“ (Versionsanzeige unten in der Mitte von Webseite und Panel).
#
#   bash scripts/changelog.sh [Repo-Ordner] [Anzahl Versionen] > apps/server/changelog.txt
#
# install.sh und update.sh rufen das vor dem Bauen auf – dort liegt das Repo mit Git, im Image nicht (und MoinMorni
# muss GitHub dafür nicht fragen). Jede Version ist ein Commit auf dem Branch (nur die erste Elternlinie, wie die
# Versionsnummer in mm_version: Update 188 = v1.8.8). Bei einem Merge stehen die hereingeholten Commits dabei – sagt
# der Merge selbst nichts, zeigt MoinMorni deren Stichpunkte.
#
# Ausgabe (liest apps/server/src/system/changelog.ts): eine Kopfzeile, dann Einträge, jeder beginnt mit dem Zeichen
# 0x1E (Datensatz-Trenner, kommt in Commit-Nachrichten nicht vor):
#   V <Nummer> <Kurz-Commit> <Datum ISO> <Eltern …>   + Zeilenumbruch + Nachricht   – eine Version
#   M <Kurz-Commit> <Datum ISO>                       + Zeilenumbruch + Nachricht   – hereingeholt (zur Version davor)
# Nur Commit-Texte (die stehen ohnehin öffentlich auf GitHub), nichts aus der .env.
#
# Verfasst mit Claude 🤖

set -Eeuo pipefail

REPO_DIR="${1:-.}"
MAX_VERSIONS="${2:-60}"
# Höchstens so viele hereingeholte Commits je Merge (ein langer Zweig soll die Datei nicht aufblähen).
MAX_MERGED=40
HEADER="MoinMorni-Änderungen 1"

[[ "${MAX_VERSIONS}" =~ ^[0-9]+$ ]] || { echo "Anzahl Versionen muss eine Zahl sein" >&2; exit 2; }
total="$(git -C "${REPO_DIR}" rev-list --count --first-parent HEAD)"
printf '%s\n' "${HEADER}"
i=0
while read -r sha; do
  printf '\036V %d ' "$((total - i))"
  git -C "${REPO_DIR}" log -1 --format='%h %cI %P%n%B' "${sha}"
  # Merge: was er hereinholt (ohne weitere Merges), neueste zuerst.
  if git -C "${REPO_DIR}" rev-parse -q --verify "${sha}^2" >/dev/null; then
    git -C "${REPO_DIR}" log --no-merges -n "${MAX_MERGED}" --format='%x1eM %h %cI%n%B' "${sha}^1..${sha}"
  fi
  i=$((i + 1))
done < <(git -C "${REPO_DIR}" rev-list --first-parent -n "${MAX_VERSIONS}" HEAD)
