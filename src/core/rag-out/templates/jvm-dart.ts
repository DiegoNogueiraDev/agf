/*!
 * SPDX-License-Identifier: Apache-2.0
 * Copyright © 2026 Diego Lima Nogueira de Paula
 *
 * Skeletons for the scaffolds RAG-OUT could never recover, because their language is not this
 * repository's. Cross-language reuse was the gap the project's own notes kept pointing at, and it
 * was never a detection problem — `Language` covers thirteen. It was that the corpus had nothing
 * to hand over outside TypeScript.
 *
 * The gate refuses to recover a scaffold whose language does not match the project, so a Kotlin
 * skeleton never lands in a Python repo. What it does now is exist.
 */

/** `templates/spring-rest-endpoint.md` — controller, service seam, DTO, and the test that fails first. */
export const SPRING_REST_ENDPOINT = `// {{description}}

package com.example.{{resourceName}};

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;

// {{dto}} — a record, not a bean. Validation annotations live on the fields.
record {{resourceName}}Request(@jakarta.validation.constraints.NotBlank String name) {}

record {{resourceName}}Response(Long id, String name) {}

@RestController
@RequestMapping("/{{resourceName}}")
class {{resourceName}}Controller {

    private final {{resourceName}}Service service;

    {{resourceName}}Controller({{resourceName}}Service service) {
        this.service = service;
    }

    // {{methods[]}} — one handler per entry. The controller maps; the service decides.
    @PostMapping
    ResponseEntity<{{resourceName}}Response> create(@Valid @RequestBody {{resourceName}}Request request) {
        throw new UnsupportedOperationException("not implemented");
    }
}

interface {{resourceName}}Service {
    {{resourceName}}Response create({{resourceName}}Request request);
}
`

/** `templates/kotlin-ktor-route.md` — a route module with serialization and a suspending handler. */
export const KOTLIN_KTOR_ROUTE = `// {{description}}

package com.example.routes

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.*
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

// {{responseModel}} — serializable, and the only shape that crosses the wire.
@Serializable
data class {{responseModel}}(val id: Long, val name: String)

@Serializable
data class {{responseModel}}Request(val name: String)

/**
 * Registered from the application module: install(ContentNegotiation) { json() } lives there,
 * not here. A route that configures the server is a route you cannot test.
 */
fun Route.{{responseModel}}Routes(service: {{responseModel}}Service) {
    route("{{routePath}}") {
        // {{methods[]}} — one handler per entry. Suspend all the way down; never block the loop.
        post {
            val request = call.receive<{{responseModel}}Request>()
            call.respond(HttpStatusCode.NotImplemented, request)
        }
    }
}

interface {{responseModel}}Service {
    suspend fun create(name: String): {{responseModel}}
}
`

/** `templates/dart-flutter-widget.md` — a StatefulWidget whose state is explicit and disposed. */
export const DART_FLUTTER_WIDGET = `// {{description}}

import 'package:flutter/material.dart';

class {{widgetName}} extends StatefulWidget {
  const {{widgetName}}({super.key});

  @override
  State<{{widgetName}}> createState() => _{{widgetName}}State();
}

class _{{widgetName}}State extends State<{{widgetName}}> {
  // {{stateFields[]}} — one field per entry. Anything with a listener is disposed below.

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    // Controllers and subscriptions, in reverse order of creation.
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: '{{widgetName}}',
      child: const SizedBox.shrink(),
    );
  }
}
`
