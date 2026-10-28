
Tenemos el primer aparteado de certificados, donde se tienen las siguientes rutas:

Crear certificado: en este menu se crean los certificados en base a los archivos originales su objetivo es la digitalizacion de los datos de usando una ia como apoyo para el rellenado de las tablas, ademas de compactar y tomar solo la informacion relevante, todos los certificados representan su informacion en tablas, esa informacion es la que guardamos

Lista de Certificados: Se mustran todos los certificados guardados, donde se pueden filtrar en activos, incactivos, por id o nombre, dentro de este componete cada certificado tiene asociado 4 botones:
-Ver Resumenen, solo muestra detalles generales del certificado junto con el formato json en el que se guardan las tablas
-Ver detalle, se muestran todos las tablas con sus detalles asociados, ademas de que desde este componente se pueden exportar las tablas a excel
-Editar:
    Este componente es paracido a crear certificado, se cargan todas las tablas y solo permite editar los datos de las tablas y algunos de los datos de certificado.
    Adicional a eso tiene herrmientas para el tratamiento de los datos:
        - Separar texto: cuando se presenta el siguiente formato (-0,0016 ± 0,0022) '±' usa este simbolo para separar la cadena y la divide en don numeros, incertidumbre y error
        - Eliminar texto: solo se encarga de eliminar el texto de la columna que se selecciono
    Estas herrmientas se usan oprimiendo el boton correspondiente, y en cada columna aparecera un boton para que sea seleccionada.
-Desactivar: Esta bandera hace referencia a si el certificado es actual o el mas reciente, los certificados inactivos son viejos u obsoletos
Administrar certificados: Solo administradores pueden acceder

CMC: Se muestran todos los componentes asociados al mostrar y calcular cmc
-Parametros de CMC, Se muestra una seccion del calulo del CMC, este solo calcula un registro de cada una de las tablas, obliga al usuario a usar el mismo rango para el calculo
-Parametros de CMC por rangos, funciona similar que el anterior, solo que toma la cantidad completa del registros por rango, hace un promedio de errores y toma la incertidumbre mas alta asociada al rango
        En Los dos componentesal dar calcular lleva a un componente en comun donde se muestran los resultados
-Resultados CMC, muestra los resultados del calculo mostrando los pesos asociados a cada una de las contribuciones a la incertidumbres consideradas en el calculo, ademas presenta los botones de guarar CMC, este componente puede recivir varios calculos y a su vez guardar los que se quieran guardar o todos los CMC calculados
-Lista de cmc, Se muestran todo los cmc calculados hasta el momento:
    Muestra 3 botones asociados
    -Ver resumen: Solo muestra las incertidumbres mas relevantes del calculo
    -Ver detalle: redirige a Ver Resultados sonde se muestran los pesos, y todo asociado al calculo, ademas de poder exportar a excel

Herramientas: Son herramientas de desarrollo
    -Calculo del CMC: En este calculo el usuario tiene que poner los parametros manualmente para hacer el calculo, ahi mismo se muestran los resultado en tiempo real
    -Procesar imagen: Tu colocas la imagen y el servidor te responde con la tabla extraida en html, y la pagina te la muestra en una tabla
    -Configuracion de alertas: Se m uestran ejemplos de como es que se manejan las alertas y todas la configuraciones que pueden haber
