let slots = [];

let admin = false;



function tab(id){

document.querySelectorAll(".tab")

.forEach(t=>t.style.display="none");

document.getElementById(id).style.display="block";

}



fetch("/slots")

.then(r=>r.json())

.then(data=>{

slots=data;

draw();

});



function draw(){

let div=document.getElementById("slots");

div.innerHTML="";



slots.forEach((s,i)=>{

let d=document.createElement("div");

d.className="slot";



if(s) d.classList.add("busy");



d.onclick=()=>{

if(!admin) return;



slots[i]=slots[i]?0:1;

draw();

};



div.appendChild(d);

});

}



document.addEventListener("keydown",e=>{

if(e.key==="a"){

let p=prompt("пароль");



fetch("/slots",{

method:"POST",

headers:{ "Content-Type":"application/json" },

body:JSON.stringify({

password:p,

slots:slots

})

})

.then(r=>{

if(r.status===200){

admin=true;

alert("admin");

}

});

}

});



fetch("/doma")

.then(r=>r.json())

.then(data=>{

let table=document.getElementById("table");



data.forEach(row=>{

let tr=document.createElement("tr");



for(let k in row){

let td=document.createElement("td");

td.innerText=row[k];

tr.appendChild(td);

}



table.appendChild(tr);

});

});