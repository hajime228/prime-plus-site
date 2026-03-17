let slots = []
let admin = false

function showTab(id){

document.querySelectorAll(".tab")
.forEach(t=>t.style.display="none")

document.getElementById(id).style.display="block"

}



fetch("/slots")
.then(r=>r.json())
.then(data=>{
slots=data
drawSlots()
})

function drawSlots(){

const div=document.getElementById("slots")
div.innerHTML=""

slots.forEach((s,i)=>{

const d=document.createElement("div")

d.className="slot"

if(s) d.classList.add("busy")

d.onclick=()=>{

if(!admin)return

slots[i]=slots[i]?0:1

drawSlots()

}

div.appendChild(d)

})

}



document.addEventListener("keydown",e=>{

if(e.key==="a"){

const p=prompt("пароль")

if(p==="admin123"){

admin=true

alert("admin")

}

}

})



fetch("/doma")
.then(r=>r.json())
.then(data=>{

const table=document.getElementById("table")

data.forEach(row=>{

let tr=document.createElement("tr")

for(let k in row){

let td=document.createElement("td")

td.innerText=row[k]

tr.appendChild(td)

}

table.appendChild(tr)

})

})