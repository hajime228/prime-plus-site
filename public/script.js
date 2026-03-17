let slots=[]
let admin=false

/* POPUP */

function openPopup(id){

document.querySelectorAll(".popup")
.forEach(p=>p.style.display="none")

document.getElementById(id).style.display="flex"

}

function closePopup(){

document.querySelectorAll(".popup")
.forEach(p=>p.style.display="none")

}

/* SLOTS */

fetch("/slots")
.then(r=>r.json())
.then(data=>{
slots=data
drawSlots()
})

function drawSlots(){

let div=document.getElementById("slots")
div.innerHTML=""

slots.forEach((s,i)=>{

let d=document.createElement("div")

d.className="slot"

if(s) d.classList.add("busy")

d.onclick=()=>{

if(!admin) return

slots[i]=slots[i]?0:1
drawSlots()

}

div.appendChild(d)

})

}

/* ADMIN */

document.addEventListener("keydown",e=>{

if(e.key==="a"){

let p=prompt("пароль")

fetch("/slots",{

method:"POST",
headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
password:p,
slots:slots
})

})
.then(r=>{

if(r.status===200){

admin=true
alert("admin режим")

}

})

}

})

/* EXCEL */

fetch("/doma")
.then(r=>r.json())
.then(data=>{

let table=document.getElementById("table")

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

/* MAP ZOOM */

let map=document.getElementById("map")
let scale=1
let x=0
let y=0

map.onwheel=e=>{

e.preventDefault()

scale+=e.deltaY*-0.001

if(scale<1) scale=1
if(scale>3) scale=3

map.style.transform=
`translate(${x}px,${y}px) scale(${scale})`

}

let down=false

map.onmousedown=e=>{
down=true
}

document.onmouseup=e=>{
down=false
}

document.onmousemove=e=>{

if(!down) return

x+=e.movementX
y+=e.movementY

map.style.transform=
`translate(${x}px,${y}px) scale(${scale})`

}