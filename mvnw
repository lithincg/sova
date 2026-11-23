#!/bin/sh
set -euf
trim() { printf "%s" "${1}" | tr -d '[:space:]'; }
hash_string() {
  str="${1:-}" h=0
  while [ -n "$str" ]; do
    char="${str%"${str#?}"}"
    h=$(((h * 31 + $(LC_CTYPE=C printf %d "'$char")) % 4294967296))
    str="${str#?}"
  done
  printf %x\\n $h
}
scriptDir="$(dirname "$0")"
scriptName="$(basename "$0")"
while IFS="=" read -r key value; do
  case "${key-}" in
  distributionUrl) distributionUrl=$(trim "${value-}") ;;
  esac
done <"$scriptDir/.mvn/wrapper/maven-wrapper.properties"
MVN_CMD="mvn${scriptName#mvnw}"
distributionUrlName="${distributionUrl##*/}"
distributionUrlNameMain="${distributionUrlName%.*}"
distributionUrlNameMain="${distributionUrlNameMain%-bin}"
MAVEN_USER_HOME="${MAVEN_USER_HOME:-${HOME}/.m2}"
MAVEN_HOME="${MAVEN_USER_HOME}/wrapper/dists/${distributionUrlNameMain-}/$(hash_string "$distributionUrl")"
exec_maven() { exec "$MAVEN_HOME/bin/$MVN_CMD" "$@"; }
if [ -d "$MAVEN_HOME" ]; then exec_maven "$@"; fi
TMP_DOWNLOAD_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DOWNLOAD_DIR"' HUP INT TERM EXIT
mkdir -p -- "${MAVEN_HOME%/*}"
curl --silent -f -L -o "$TMP_DOWNLOAD_DIR/$distributionUrlName" "$distributionUrl"
unzip -q "$TMP_DOWNLOAD_DIR/$distributionUrlName" -d "$TMP_DOWNLOAD_DIR"
mv -- "$TMP_DOWNLOAD_DIR/$distributionUrlNameMain" "$MAVEN_HOME"
exec_maven "$@"
