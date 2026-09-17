(async () => {
    const auth = fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", {method: "POST", credentials: "include"})
    const data = await auth.then((response) => response.json());
    console.log("got token: "+data.token);
    const token = data.token;
    return token;
});

/*.then((data) => {
    console.log("got token: "+data.token);
}).catch((error) => { 
    throw new Error("unable to retrieve token: "+error); 
});*/