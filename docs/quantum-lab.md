# Adding Qanvas to quantum-lab

Qanvas ships a small web-server image, `ghcr.io/ethan-rivas/qanvas`, built from the `Dockerfile` in this repository and published for each release tag. quantum-lab runs it as one more service since its commit `437c091`. This page records what that takes, so the setup can be repeated or updated for a new Qanvas version (change the image tag in quantum-lab's `docker-compose.yml`). These changes belong in the quantum-lab repository, not here.

## Before you start

- The repository and the `qanvas` package on GitHub Container Registry must both be public. Making the repository public doesn't change the package: set it in the package's settings under "Change visibility".
- The `v0.1.0` tag must exist, so the image `ghcr.io/ethan-rivas/qanvas:0.1.0` has been published.

## 1. `docker-compose.yml`

Add the service after `quilc`:

```yaml
  # Qanvas, the visual circuit builder: http://localhost:8080
  qanvas:
    image: ghcr.io/ethan-rivas/qanvas:0.1.0
    ports:
      - "127.0.0.1:8080:8080"   # only reachable from your own machine
```

It needs no volumes or settings: circuits live in the browser and in share links, and the app works offline once it has loaded.

## 2. README (`README.md` and `README.es.md`)

- Replace the first roadmap item, the Quirk circuit builder, with a checked item: "**Drag-and-drop circuit builder.** [Qanvas](https://github.com/Ethan-Rivas/qanvas) runs at http://localhost:8080: build circuits visually, step through them with explanations and copy Qiskit, Cirq or pyQuil code into a notebook."
- The second item, "From Quirk to notebook", becomes Qanvas's own 0.2 plan ("Open in notebook" and the Qiskit Aer bridge), so it can point to Qanvas's roadmap in `PLAN.md` instead.

## 3. Smoke test

Check that the service answers, for example:

```sh
curl -fsS http://127.0.0.1:8080/ | grep -q '<title>Qanvas</title>'
```

## 4. The lab bridge (Qanvas 0.2)

From 0.2, Qanvas's lab-only features go through a small Python service in quantum-lab, `bridge/bridge.py`, run from the lab's own image as the `lab-bridge` service with the `notebooks/` folder mounted. It has no published port.

- **Forwarding:** when `QANVAS_BRIDGE_URL` is set, `deploy/bridge.sh` makes the image's nginx forward `/api/` to that address, resolving the name on each request so Qanvas starts even before the bridge does. Without the variable, `/api/` answers 404.
- **Discovery:** at start, Qanvas asks `./api/health`. Only when the bridge answers does the Download dialog show **Open in notebook**; the website and plain Docker never see it.
- **Open in notebook:** Qanvas sends the same notebook the Download button saves to `POST /api/notebook`. The bridge saves it as `notebooks/qanvas/<name>.ipynb`, never overwriting a file (a second save becomes `<name>-2.ipynb`), and answers with the JupyterLab link Qanvas opens. `BRIDGE_JUPYTER_URL` sets where the browser reaches JupyterLab.
- **Only Qanvas can write:** any website could make the browser send a request to 127.0.0.1:8080, so the bridge only accepts JSON whose `Origin` matches the address it was reached at. A request from another website is refused, and the JSON requirement means the browser asks first and gets no permission.
- **Only Qanvas's own addresses:** the bridge answers only requests whose `Host` is `localhost`, `127.0.0.1` or `[::1]` (any port), or a GitHub Codespaces address (`<codespace>-<port>.app.github.dev`). This stops DNS rebinding, where a website points its own name at 127.0.0.1 so the browser treats the bridge as part of that website. In Codespaces, the JupyterLab link becomes `https://<codespace>-8888.app.github.dev`.

In `docker-compose.yml`:

```yaml
  qanvas:
    image: ghcr.io/ethan-rivas/qanvas:0.2.0
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      QANVAS_BRIDGE_URL: http://lab-bridge:8000
    depends_on:
      - lab-bridge

  lab-bridge:
    image: quantum-lab:local
    pull_policy: never
    command: ["python", "/opt/quantum-lab/bridge.py"]
    volumes:
      - ./notebooks:/home/quantum/work
    environment:
      JUPYTER_TOKEN: ${JUPYTER_TOKEN:-quantum}
      BRIDGE_JUPYTER_URL: http://127.0.0.1:8888
    depends_on:
      - notebook
```

To try an unreleased Qanvas in the lab, build it as `qanvas:local` and start the lab with a compose override that sets the `qanvas` service's image to `qanvas:local` and `pull_policy: never`.

## Checking the image locally

```sh
docker build -t qanvas:local .
docker run --rm -p 127.0.0.1:8080:8080 qanvas:local
```
