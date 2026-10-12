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

## Checking the image locally

```sh
docker build -t qanvas:local .
docker run --rm -p 127.0.0.1:8080:8080 qanvas:local
```
