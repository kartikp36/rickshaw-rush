import re

with open("game.js", "r") as f:
    content = f.read()

match = re.search(r"// Rotate oncoming traffic.*?scene\.add\(this\.mesh\);", content, re.DOTALL)
if match:
    old_code = match.group(0)
    new_code = """// Set orientation based on lane and traffic direction
        if (this.type !== 'cow') {
            // Default models are created with headlights at +Z.
            // Player starts at Z=0 and moves down the -Z axis (conceptually).
            // Objects moving towards the player (+Z direction) should face +Z (rotation 0).
            // Objects moving away from the player (-Z direction) should face -Z (rotation Math.PI).

            if (this.lane >= 2) {
                // Oncoming traffic (lanes 2, 3) - coming towards player. Headlights should point towards player (+Z).
                this.mesh.rotation.y = 0;
            } else {
                // Same direction traffic (lanes 0, 1) - going same way as player. Headlights should point away (-Z).
                this.mesh.rotation.y = Math.PI;
            }
        }

        this.mesh.position.set(xPos, 0, -80); // Spawn far away
        scene.add(this.mesh);"""

    with open("game.js", "w") as f:
        f.write(content.replace(old_code, new_code))
    print("Replaced!")
else:
    print("Not found.")
