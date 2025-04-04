// prono_telegram.js
'use strict'

const axios = require("axios")
const sprintf = require("sprintf-js").sprintf
const fs = require('fs')
const config = require('config')

// Este código descarga el pronóstico del Alerta, se fija si va a haber sudestada y publica una notificación e un grupo de Telegram


const default_status = {
	"alerta": false,
	"cese": false
}

function update_status(current_status) { // current_status = {alerta: bool, cese: bool, fecha: Date, max_fecha: Date, max_valor: real}
	let old_status
	if(fs.existsSync(config.status_file)) {
		try {
			var status_file = fs.readFileSync(config.status_file,'utf-8')
			old_status = JSON.parse(status_file)
		} catch(e) {
			console.error(e.toString())
			old_status = default_status
		}
	} else {
		old_status = default_status
	}
	if(old_status.alerta) {
		if(current_status.alerta) { // SE MANTIENE ALERTA
			current_status.cese = false
		} else { // CESE DE ALERTA
			current_status.cese = true
		}
	} else {
		if(current_status.alerta) { // 	COMIENZA ALERTA
			current_status.cese = false
		} else { // NADA
			current_status.cese = false
		}
	}
	try {
		fs.writeFileSync(config.status_file,JSON.stringify(current_status,null,2))
	} catch(e) {
		console.error(e.toString())
	}
	return current_status
}


function prono_telegram(post_telegram=true) {
	/////////////////////////////// Descarga Prono
	var timestart = new Date()
	timestart.setTime(timestart.getTime() - 2*3600*1000)
	var timeend = new Date(timestart.getTime() + 5*24*3600*1000)
	var url= config.url + `/sim/calibrados/${config.cal_id}/corridas/last`
	var params = {
		timestart: timestart.toISOString(),
		timeend: timeend.toISOString(),
 		series_id: config.series_id,
		qualifier: config.qualifier,
		group_by_qualifier: true,
		includeProno: true
    }
	return axios.get(
		url,
		{
			params: params, 
			responseType: "json",
			headers: {
				"Authorization": `Bearer ${config.a5_token}`
			}
		})
	.then(response=>{
		console.info(`downloaded: ${response.config.url}?${new URLSearchParams(response.config.params)}`)
		if(!response.data) {
			throw("No response from alerta api")
		}
		if(!response.data.series) {
			throw("No data found")
		}
		if(!response.data.series.length) {
			throw("alerta api returned empty array")
		}
		var serie
		for(var i=0;i<response.data.series.length;i++) {
			if(response.data.series[i].series_id == config.series_id && response.data.series[i].qualifier == config.qualifier) {
				console.log("found serie " + response.data.series[i].series_id + ", qualifier " + response.data.series[i].qualifier)
				serie = response.data.series[i]
			}
		}
		if(!serie) {
			throw("series_id " + config.series_id + " qualifier " + config.qualifier + " not found in response data")
		}
		if(!serie.pronosticos || !serie.pronosticos.length) {
			throw("returned series is empty")
		}
		//~ console.log({url: url, data:response.data.data})
		var body = {
			chat_id: '@PHC_azul', //Canal de Telegram en que se publica, en este caso: PHC_azul
			text: 'Alerta de sudestada, visite web INA' // Notificación a publicar
		}

		///////////////////////////////////////////////////////////////////////////////////////////////////////////
		// Determina el máximo valor que indica el prono para los prox 4 días

		var max = {
			fecha: null,
			valor: -9999
		}
		serie.pronosticos.forEach(d=> {
			if(d.valor > max.valor) {
        			max.valor = d.valor
			        max.fecha = d.timestart
    			}
		})
		console.log({max:max})
		max.valor = parseFloat(max.valor)
		max.fecha = new Date(max.fecha)
		var current_status = {fecha:new Date().toISOString(), max_fecha: max.fecha.toISOString(), max_valor: max.valor}
		current_status.alerta = (max.valor > config.nivel_alerta) ? true : false
		current_status = update_status(current_status)
		if(current_status.alerta || current_status.cese) {
			// Si el nivel max supera Alerta, notifica en el Canal de Telegram.
			body.text = (current_status.alerta) ? sprintf("Alerta de sudestada. Fecha: %s, altura en SFER: %.02f. Visite web INA: https://www.ina.gob.ar/delta/index.php?seccion=9",format_date(max.fecha),max.valor) : sprintf("Cese de alerta de sudestada. Fecha: %s. Visite web INA: https://www.ina.gob.ar/delta/index.php?seccion=9",format_date(new Date()))
			if(!post_telegram) {
				console.log(body.text)
				return true
			}
			return axios.get(
				config.apiUrl + config.apiToken + "/sendMessage",
				{ 
					params: body, 
					responseType: "json"
				})
			.then(response=>{
				console.log("alert sent. Status:" + response.status + ". content: " + JSON.stringify(response.data))
				return true
			})
		} else {
			console.log("No alert")
			return true
		}
	})
	.catch(e=>{
		console.error(e)
		return false
	})
}

function format_date(date) {
    const month_names = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dec"]
    date = new Date(date)
    var y = date.getFullYear()
    var m = month_names[date.getMonth()]
    var d = date.getDate()
    var H = date.getHours()
    var M = date.getMinutes()
    var date_formatted = sprintf ("%02d-%s-%04d %02d:%02d", d, m, y, H, M)
	return date_formatted
}

prono_telegram(true)
