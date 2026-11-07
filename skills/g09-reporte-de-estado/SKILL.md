---
name: g09-reporte-de-estado
description: Preparar el reporte de estado de Zervi para Equipo09 cruzando los tickets del sprint en Jira mediante el MCP de Atlassian con sus pull requests de GitHub. Usar para informar avances, revisiones pendientes y bloqueos con evidencia.
tools: Read, Grep, Glob, Bash, Skill
metadata:
  tipo: agente
  area: [gestion]
  fase: [revision]
  tecnologias: [agnostico]
  metodologia: [scrum]
  herramientas: [codex]
  requiere: [jira, github]
  grupo: "09"
  autor:
    nombre: Máximo Sallemi
    github: MaximoSallemi
  responsables: [MaximoSallemi]
  madurez: prototipo
  relacionados: [review-ticket-pr, pre-pr-gate]
---

# Reporte de estado de Equipo09

Preparar el reporte en español para el sprint o período solicitado. Usar el sprint activo de Zervi por defecto e indicar la fecha de corte en horario argentino.

1. Leer la [pestaña Equipo09](https://docs.google.com/spreadsheets/d/1YRIUxJDPMUO2brqXfpIalhA9443JGiBFxYrT4_WZd5o/edit?gid=275452955#gid=275452955) o su exportación. Tomar los encabezados, el orden, la unidad de cada fila y el último período completo como modelo. Conservar las categorías que use la hoja. Si falta acceso, entregar la tabla alternativa descrita abajo e identificarla como provisoria.
2. Usar el MCP de Atlassian para resolver el sitio y confirmar el proyecto Zervi. Consultar todos los tickets del sprint con JQL, por ejemplo `project = ZRV AND sprint = <id>` una vez confirmados ambos valores. Paginar hasta el final. Recuperar clave, resumen, responsable, estado, resolución y dependencias. Para cortes históricos, reconstruir el estado al cierre con el historial o indicar qué datos solo reflejan el presente.
3. Resolver el repositorio desde los enlaces de Jira y el remoto de Zervi. Consultar las PRs mediante el conector de GitHub o `gh` autenticado. Incluir borradores, abiertas, cerradas y mergeadas. Priorizar el enlace explícito del ticket. Buscar también la clave completa en título, descripción y branch, distinguiendo ZRV-9 de ZRV-90. Una similitud de títulos solo habilita una asociación tentativa identificada como tal.
4. Para cada PR confirmar URL, rama destino, estado, fecha de merge y revisión pendiente cuando corresponda. Admitir varias PRs por ticket y varios tickets por PR. Si el frontend está mergeado y el backend pendiente, describir el avance por capa. Para tareas sin código, indicar «no aplica». Diferenciar «sin PR encontrada» tras una búsqueda completa de «no verificable» por falta de acceso.
5. Entregar el reporte en la conversación con enlaces a Jira y GitHub. Respetar el formato de Equipo09 y agregar la trazabilidad debajo si sus columnas no la contemplan. Para el formato provisorio usar una fila por ticket con **Ticket y funcionalidad | Responsable | Estado Jira | PRs y estado | Pendiente o bloqueo**. Resumir entregas, revisiones pendientes y discrepancias verificadas. Contar tickets por clave y PRs por repositorio y número. Identificar la fuente y cobertura de cada total. Trabajar en modo lectura.
