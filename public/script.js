let isAdmin = false;

/* Слоты */

window.onload = function() {
    const saved = JSON.parse(localStorage.getItem("slots"));
    if(saved){
        document.querySelectorAll('.slot').forEach((slot,i)=>{
            if(saved[i]) slot.classList.add("busy");
        });
    }
};

document.querySelectorAll('.slot').forEach((slot,i)=>{
    slot.addEventListener("click",function(){
        if(!isAdmin) return;
        this.classList.toggle("busy");
        saveSlots();
    });
});

function saveSlots(){
    const arr=[];
    document.querySelectorAll('.slot').forEach(s=>{
        arr.push(s.classList.contains("busy"));
    });
    localStorage.setItem("slots",JSON.stringify(arr));
}

/* Авторизация */

async function adminLogin(){
    const pass = prompt("Введите пароль администратора:");

    const response = await fetch("/admin-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass })
    });

    const data = await response.json();

    if(data.success){
        isAdmin = true;
        alert("Админ режим включен");
    } else {
        alert("Неверный пароль");
    }
}

/* Модалки */

function openModal(type){
    const modal=document.getElementById("modal");
    const text=document.getElementById("modal-text");

    if(type==="about")
        text.innerHTML="<h2>О компании</h2><p>Размещаем рекламу более 5 лет.</p>";

    if(type==="prices")
        text.innerHTML="<h2>Тарифы</h2><p>1 слот — 1000 руб/мес</p>";

    if(type==="contacts")
        text.innerHTML="<h2>Контакты</h2><p>+7 (999) 123-45-67</p>";

    if(type==="homes")
        text.innerHTML="<h2>Дома</h2><p>Список домов доступен по запросу.</p>";

    modal.style.display="flex";
}

function closeModal(){
    document.getElementById("modal").style.display="none";
}

window.onclick=function(e){
    const modal=document.getElementById("modal");
    if(e.target==modal) modal.style.display="none";
};

/* Масштаб карты */

const map = document.getElementById("map");

let scale = 1;
let posX = 0;
let posY = 0;
let dragging = false;
let startX, startY;

map.addEventListener("wheel", function(e){
    e.preventDefault();
    scale += e.deltaY < 0 ? 0.1 : -0.1;
    if(scale < 1) scale = 1;
    update();
});

map.addEventListener("mousedown", function(e){
    dragging = true;
    startX = e.clientX - posX;
    startY = e.clientY - posY;
    map.style.cursor="grabbing";
});

document.addEventListener("mouseup", function(){
    dragging = false;
    map.style.cursor="grab";
});

document.addEventListener("mousemove", function(e){
    if(!dragging) return;
    posX = e.clientX - startX;
    posY = e.clientY - startY;
    update();
});

function update(){
    map.style.transform =
        `translate(${posX}px, ${posY}px) scale(${scale})`;
}