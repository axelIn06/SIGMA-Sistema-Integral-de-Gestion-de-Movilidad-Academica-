from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

OUT = "output/primera-etapa/Informe_Primera_Etapa_SIGMA_OCRI.docx"

doc = Document()
section = doc.sections[0]
section.top_margin = Inches(1)
section.bottom_margin = Inches(1)
section.left_margin = Inches(1)
section.right_margin = Inches(1)
section.header_distance = Inches(0.492)
section.footer_distance = Inches(0.492)

styles = doc.styles
normal = styles['Normal']
normal.font.name = 'Arial'
normal._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
normal.font.size = Pt(11)
normal.paragraph_format.space_after = Pt(8)
normal.paragraph_format.line_spacing = 1.15

for name, size, color, before, after in [
    ('Heading 1', 20, '000000', 20, 6),
    ('Heading 2', 16, '000000', 18, 6),
    ('Heading 3', 14, '434343', 16, 4),
]:
    s = styles[name]
    s.font.name = 'Arial'
    s._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
    s.font.size = Pt(size)
    s.font.color.rgb = RGBColor.from_string(color)
    s.font.bold = False
    s.paragraph_format.space_before = Pt(before)
    s.paragraph_format.space_after = Pt(after)
    s.paragraph_format.line_spacing = 1.15

def set_keep(paragraph):
    ppr = paragraph._p.get_or_add_pPr()
    keep = OxmlElement('w:keepNext')
    ppr.append(keep)

def add_title(text):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(text)
    r.font.name = 'Arial'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
    r.font.size = Pt(26)
    r.font.color.rgb = RGBColor(0, 0, 0)
    r.bold = False
    return p

def add_center(text, size=11, bold=False, italic=False, after=0):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(after)
    r = p.add_run(text)
    r.font.name = 'Arial'
    r._element.rPr.rFonts.set(qn('w:eastAsia'), 'Arial')
    r.font.size = Pt(size)
    r.bold = bold
    r.italic = italic
    return p

def add_label(label, value):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    a = p.add_run(label + ': ')
    a.bold = True
    p.add_run(value)
    return p

def h1(text):
    p = doc.add_paragraph(text, style='Heading 1')
    set_keep(p)
    return p

def h2(text):
    p = doc.add_paragraph(text, style='Heading 2')
    set_keep(p)
    return p

def h3(text):
    p = doc.add_paragraph(text, style='Heading 3')
    set_keep(p)
    return p

def para(text):
    return doc.add_paragraph(text)

def bullet(text):
    # Los elementos se presentan como párrafos breves con sangría para
    # conservar una lectura limpia tras la conversión a Google Docs.
    p = doc.add_paragraph(text)
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.first_line_indent = Inches(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    return p

def num(text):
    p = doc.add_paragraph(text)
    p.paragraph_format.left_indent = Inches(0.25)
    p.paragraph_format.first_line_indent = Inches(0)
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    return p

# Portada sencilla, deliberadamente distinta al documento de referencia.
add_center('UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO', 12, bold=True, after=2)
add_center('FACULTAD DE INGENIERÍA ELÉCTRICA, ELECTRÓNICA, INFORMÁTICA Y SISTEMAS', 11, bold=True, after=2)
add_center('ESCUELA PROFESIONAL DE INGENIERÍA INFORMÁTICA Y DE SISTEMAS', 11, bold=True, after=24)
add_title('Informe de Prácticas Preprofesionales')
add_center('Primera etapa: análisis y definición inicial de SIGMA OCRI', 13, italic=True, after=28)

add_label('Empresa', 'Universidad Nacional de San Antonio Abad del Cusco')
add_label('Área', 'Oficina de Cooperación y Relaciones Internacionales (OCRI)')
add_label('Practicante', 'Axel Barnaby Aranibar Rojas')
add_label('Código', '220547')
add_label('Período de prácticas', '07/08/2026 - 04/01/2027')
add_label('Etapa informada', '07/08/2026 - 23/08/2026')
doc.add_paragraph()
add_center('CUSCO - PERÚ', 11, after=2)
add_center('2026', 11)

doc.add_page_break()

h1('Introducción')
para('Las prácticas preprofesionales permiten trasladar los conocimientos adquiridos en la formación de Ingeniería Informática y de Sistemas a una necesidad institucional concreta. En este caso, la necesidad está relacionada con la gestión de la movilidad académica de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC), proceso en el que intervienen estudiantes, universidades de origen o destino y la Oficina de Cooperación y Relaciones Internacionales (OCRI).')
para('El presente informe explica la primera etapa del proyecto SIGMA OCRI, denominado Sistema Integral de Gestión de Movilidad Académica. Esta etapa no busca afirmar que el sistema ya se encuentra concluido. Su propósito es dejar clara la situación inicial, ordenar lo que el sistema debe resolver y construir una base técnica y documental que permita avanzar con menor riesgo en las siguientes etapas.')
para('Para que el documento sea fácil de comprender, primero se describe el contexto de OCRI; después se explica el problema, la propuesta y las actividades realizadas; finalmente, se presentan los resultados de esta etapa, las conclusiones y las recomendaciones de continuidad.')

h1('Capítulo I: Contexto institucional y del proyecto')
h2('1.1 Oficina de Cooperación y Relaciones Internacionales')
para('La OCRI es el área institucional vinculada a la coordinación de oportunidades y procedimientos de cooperación y movilidad académica. En los procesos de movilidad participan estudiantes de la UNSAAC que postulan a instituciones de destino, así como estudiantes de universidades externas que realizan una movilidad entrante. Por ello, la información debe ser ordenada, verificable y accesible para cada actor según sus responsabilidades.')
para('La gestión incluye, entre otras tareas, la publicación de convocatorias, la recepción de expedientes, la revisión de documentos, la comunicación de observaciones y decisiones, y el seguimiento del estado de cada postulación. Cuando estas actividades se manejan de manera dispersa, resulta más difícil conocer el avance real de un expediente y mantener la trazabilidad de las decisiones.')

h2('1.2 Proyecto SIGMA OCRI')
para('SIGMA OCRI es una propuesta de sistema web para centralizar la gestión de movilidad académica. El proyecto se organiza en dos componentes principales: SGMS, para movilidad saliente de estudiantes UNSAAC; y SGME, para movilidad entrante de estudiantes de universidades externas. Ambos componentes se integran con un panel de administración destinado a OCRI.')
para('La finalidad del sistema es que cada usuario pueda realizar únicamente las acciones que le corresponden y que OCRI disponga de una vista institucional para administrar convocatorias, revisar expedientes, registrar decisiones y consultar reportes. De esta manera, la plataforma no reemplaza las decisiones académicas o administrativas; las ordena y deja evidencia del proceso.')

h2('1.3 Alcance de la primera etapa')
para('La primera etapa se concentró en comprender y delimitar el problema antes de continuar con módulos de mayor complejidad. El alcance abarcó el levantamiento de necesidades, la identificación de usuarios, el modelado preliminar de flujos, la definición de datos básicos, la priorización del trabajo y la preparación de una base funcional y técnica inicial.')
para('El período informado corresponde del 07/08/2026 al 23/08/2026. Las actividades posteriores, como el desarrollo completo de convocatorias, expedientes, reportes y despliegue institucional, permanecen como trabajo planificado dentro del período total de prácticas.')

h1('Capítulo II: Actividades desarrolladas')
h2('2.1 Objetivos de la primera etapa')
h3('Objetivo general')
para('Analizar el proceso de movilidad académica y definir la base funcional y técnica de SIGMA OCRI para orientar el desarrollo progresivo de una solución web institucional.')
h3('Objetivos específicos')
bullet('Identificar a los usuarios que intervienen en la movilidad académica y delimitar sus responsabilidades dentro del sistema.')
bullet('Representar los flujos principales de movilidad saliente y entrante desde el inicio de una postulación hasta su cierre.')
bullet('Definir los datos, estados y controles mínimos que permitan dar seguimiento a cada expediente.')
bullet('Priorizar el trabajo inicial y preparar una base demostrable para validar el alcance con OCRI.')

h2('2.2 Situación identificada')
para('El proceso de movilidad académica reúne información de distintas fuentes: convocatorias, requisitos, documentos personales y académicos, validaciones, decisiones y comunicaciones. Esta variedad hace necesario contar con una estructura común que permita saber qué información fue presentada, qué documentos requieren subsanación, quién realizó una revisión y en qué estado se encuentra cada expediente.')
para('A partir de la revisión inicial, se identificó que el sistema debía responder a dos procesos relacionados, pero diferentes. La movilidad saliente requiere acompañar al estudiante UNSAAC desde la convocatoria hasta la decisión de OCRI. La movilidad entrante requiere gestionar nominaciones de universidades externas, el registro del estudiante, la validación administrativa y académica, y la emisión o seguimiento de documentos de aceptación.')

h2('2.3 Propuesta de solución')
para('Se propuso SIGMA OCRI como una plataforma web de gestión centralizada. La propuesta separa las funciones por tipo de usuario y por proceso, pero conserva una misma base de datos y criterios de trazabilidad. Así, una convocatoria no se confunde con una postulación, un documento no se confunde con una decisión y cada cambio de estado puede quedar asociado a una acción identificable.')
para('La solución se plantea de manera modular para permitir avances verificables. Primero se define la identidad de los usuarios y sus permisos; después se desarrollan convocatorias, postulaciones, revisión documental, evaluación, cartas, notificaciones y reportes. Esta secuencia reduce el riesgo de construir pantallas sin una lógica de negocio previamente validada.')

h2('2.4 Actividades realizadas')
num('Inducción y revisión del contexto de OCRI. Se revisaron los actores, los documentos habituales, las convocatorias y los puntos de control asociados a la movilidad académica.')
num('Identificación de usuarios y responsabilidades. Se definieron como perfiles principales el administrador OCRI, el estudiante UNSAAC, el gestor externo de una universidad de origen y el estudiante externo.')
num('Modelado preliminar de flujos. Se documentaron los recorridos de SGMS y SGME, incluyendo sus estados principales, desde la postulación o nominación hasta el cierre del expediente.')
num('Definición de requerimientos iniciales. Se organizaron las necesidades por módulos: acceso, usuarios, convocatorias, movilidad saliente, movilidad entrante, documentos, evaluación, cartas, notificaciones y reportes.')
num('Diseño del modelo de datos inicial. Se identificaron entidades como perfiles, roles, universidades, dominios institucionales, convocatorias, postulaciones, documentos e historial de estados.')
num('Preparación de una base funcional. Se consolidó un prototipo navegable y una estructura de proyecto que permiten revisar la experiencia esperada para los distintos perfiles y orientar la implementación posterior.')

h2('2.5 Requerimientos iniciales priorizados')
h3('Requerimientos funcionales')
bullet('Administrar usuarios, roles operativos y universidades vinculadas a los procesos de movilidad.')
bullet('Crear y publicar convocatorias diferenciadas para movilidad saliente y movilidad entrante.')
bullet('Permitir la postulación, carga de documentos y consulta de estado por parte de los estudiantes.')
bullet('Permitir a OCRI revisar documentos, registrar observaciones, aprobar o rechazar expedientes y mantener la trazabilidad de cada decisión.')
bullet('Gestionar nominaciones externas y validaciones vinculadas a la movilidad entrante.')
bullet('Generar consultas y reportes de apoyo para el seguimiento institucional.')
h3('Requerimientos no funcionales')
bullet('Seguridad: el acceso debe controlarse según el rol y la institución del usuario.')
bullet('Trazabilidad: los cambios relevantes del expediente deben conservar un historial comprensible.')
bullet('Usabilidad: las pantallas deben permitir identificar con claridad el siguiente paso y el estado de cada proceso.')
bullet('Integridad de datos: las relaciones entre usuarios, universidades, convocatorias y expedientes deben mantenerse consistentes.')
bullet('Escalabilidad: el sistema debe poder incorporar progresivamente nuevos módulos o reglas de OCRI sin reconstruir la solución completa.')

h2('2.6 Herramientas y documentación de apoyo')
para('Durante esta etapa se utilizó un repositorio de proyecto para conservar el código, la documentación y el historial técnico. La documentación se estructuró en archivos de visión, módulos, flujos de SGMS y SGME, modelo de datos, roles y permisos, hoja de ruta, backlog y plan de sprints. Esta organización permite entender qué se decidió, por qué se decidió y qué falta por validar.')
para('Para la base técnica se consideró una aplicación web con una capa de autenticación y datos respaldada por Supabase. La configuración inicial contempla perfiles, roles y dominios institucionales, de modo que la futura gestión de accesos responda a criterios institucionales y no solo a pantallas de demostración.')

h2('2.7 Avances obtenidos')
bullet('Se delimitó el problema institucional que SIGMA OCRI busca atender.')
bullet('Se diferenciaron claramente los flujos de movilidad saliente y movilidad entrante.')
bullet('Se definieron roles operativos, módulos principales, estados iniciales y entidades relevantes.')
bullet('Se organizó un backlog inicial para continuar el desarrollo por etapas verificables.')
bullet('Se dejó una base funcional y documental que facilita la validación del alcance con OCRI antes de ampliar la implementación.')

h1('Capítulo III: Resultados de la primera etapa')
para('El principal resultado de esta primera etapa es una definición organizada del proyecto SIGMA OCRI. En lugar de iniciar directamente con pantallas aisladas, se estableció una relación entre el problema institucional, los actores, los flujos, los requisitos y la base técnica. Esto permite que cada desarrollo posterior responda a una necesidad reconocible de OCRI.')
para('Como resultado concreto, se cuenta con una visión del sistema, una separación de módulos, flujos documentados para SGMS y SGME, un modelo de datos inicial, una matriz de roles y permisos, un backlog priorizado y una planificación de sprints. Estos elementos constituyen una guía de trabajo; pueden ajustarse cuando OCRI valide requisitos específicos, pero evitan que los cambios se realicen sin registro ni criterio.')
para('También se obtuvo un prototipo navegable de referencia que ayuda a comunicar cómo se distribuirían las funciones para estudiantes, gestores externos y administración OCRI. Su valor en esta etapa es facilitar la conversación y detectar observaciones tempranas, no sustituir la versión productiva del sistema.')

h1('Conclusiones')
num('La movilidad académica requiere una gestión trazable porque integra convocatorias, documentos, validaciones y decisiones de varios actores.')
num('La separación entre SGMS, SGME y administración OCRI permite representar las diferencias operativas entre movilidad saliente, movilidad entrante y supervisión institucional.')
num('La identificación de roles, estados, módulos y datos mínimos proporciona una base coherente para las siguientes etapas de desarrollo.')
num('La documentación y el prototipo inicial reducen la ambigüedad del proyecto y facilitan que OCRI valide el alcance antes de que se implementen funcionalidades más complejas.')

h1('Recomendaciones para la siguiente etapa')
num('Validar con OCRI los requisitos, documentos obligatorios, responsables y transiciones permitidas en cada tipo de movilidad.')
num('Priorizar la implementación de convocatorias y requisitos, ya que estos elementos alimentan las postulaciones posteriores.')
num('Definir criterios de aceptación por historia de usuario para que cada avance pueda ser revisado de manera objetiva.')
num('Realizar demostraciones periódicas a la contraparte de OCRI y registrar sus observaciones antes de continuar con el siguiente sprint.')
num('Mantener actualizada la documentación técnica y funcional cada vez que se apruebe un cambio de alcance.')

h1('Anexo: Documentación de sustento')
para('La primera etapa se sustenta en la documentación del proyecto SIGMA OCRI, especialmente en los siguientes documentos de trabajo: visión del sistema, módulos, flujos de movilidad saliente y entrante, modelo de datos, permisos y roles, hoja de ruta, backlog inicial y plan general de sprints. Estos documentos se conservan en el repositorio del proyecto y permiten ampliar el detalle técnico cuando sea necesario.')

doc.save(OUT)
print(OUT)
