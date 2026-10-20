//Se crean las rutas exportables de cada uno de los sistemas ivolucrados en en el funcionamiento
//Estas url se iyetan en los servicios correspondientes
export const environment = {
  production: false,
  apiCertificados: 'http://192.168.1.187:3000/api', //Api de los Certificados
  apiCmc: 'http://192.168.1.187:3000/api/cmc-data', //Api del CMC
  apiImagen: 'http://192.168.1.206:3000', //Procesamiento de la imagen, aputa a un servidor con mejores carateristicas para extraer datos con IA
  apiPatron: 'http://192.168.1.200' //Apunta al servidor CRM de la empresa, Aun falta corroborar puerto
};
